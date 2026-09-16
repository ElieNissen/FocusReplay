'use client';
import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { Chip } from '@heroui/react';
import { replayGroups } from '@/lib/replay-layout';
import { Button } from '@heroui/react';
import { Input } from '@/components/ui/input';
import { Slider } from '@heroui/react';
import AccountHome from '@/components/account-home';
import { Lock, Play, Pause, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
const time = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
const hours = (ms: number) =>
  (ms / 3600000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' h';
const apiPath = (path: string) =>
  '/api/p/' +
  encodeURIComponent(
    typeof window === 'undefined'
      ? 'me'
      : new URLSearchParams(window.location.search).get('profile') || 'me',
  ) +
  path;
function CaptureImage({
  id,
  syncedAt,
  alt = '',
  lazy = false,
  source = 'screen',
}: {
  id: string;
  syncedAt: number;
  alt?: string;
  lazy?: boolean;
  source?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      loading={lazy ? 'lazy' : 'eager'}
      src={apiPath('/image/' + id) + '?source=' + source + (failed ? '&retry=' + syncedAt : '')}
      alt={alt}
      onError={() => setFailed(true)}
      onLoad={(e) => {
        e.currentTarget.style.visibility = 'visible';
      }}
    />
  );
}
export default function Home() {
  const [profile, setProfile] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setProfile(new URLSearchParams(window.location.search).get('profile'));
    setReady(true);
  }, []);
  if (!ready)
    return (
      <main className="login" role="status">
        FocusReplay
      </main>
    );
  return profile ? <Replay profile={profile} /> : <AccountHome />;
}
function Replay({ profile }: { profile: string }) {
  const [data, setData] = useState<any>(null),
    [locked, setLocked] = useState(true),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [day, setDay] = useState(''),
    [cursor, setCursor] = useState<number | null>(null),
    [follow, setFollow] = useState(true),
    [playing, setPlaying] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(1200);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const [speed, setSpeed] = useState(2),
    [zoom, setZoom] = useState(1);
  const timeline = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = timeline.current;
    if (!node) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(1, Math.min(8, z + (e.deltaY < 0 ? 0.25 : -0.25))));
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [locked, data?.frames?.length]);
  async function refresh() {
    if (document.hidden) return;
    try {
      const r = await fetch(apiPath('/snapshot'), { cache: 'no-store' });
      if (r.status === 401) {
        setLocked(true);
        setData(null);
        return;
      }
      if (!r.ok) throw Error('Connexion temporairement indisponible.');
      const next = await r.json();
      setData(next);
      setLocked(false);
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 180000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const frames = (data?.frames || []).filter((f: any) => !day || f.day === day);
  const index =
    follow || cursor === null
      ? Math.max(0, frames.length - 1)
      : Math.max(
          0,
          frames.findLastIndex((f: any) => f.at <= cursor),
        );
  const frame = frames[index],
    position = follow ? frames.at(-1)?.at || 0 : (cursor ?? frame?.at ?? 0);
  useLayoutEffect(() => {
    const node = timeline.current;
    if (!node || frames.length < 2) return;
    const fraction = Math.max(
      0,
      Math.min(1, (position - frames[0].at) / Math.max(1, frames.at(-1).at - frames[0].at)),
    );
    node.scrollLeft = Math.max(0, fraction * node.scrollWidth - node.clientWidth / 2);
  }, [zoom]);
  const gap = (data?.gaps || []).find((g: any) => position >= g.from && position < g.to);
  const step = (n: number) => {
    setFollow(false);
    setCursor(frames[Math.max(0, Math.min(frames.length - 1, index + n))]?.at || 0);
  };
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      if (index >= frames.length - 1) setPlaying(false);
      else step(1);
    }, 1000 / speed);
    return () => clearTimeout(t);
  }, [playing, index, frames.length, speed]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,button,[role="slider"],[role="combobox"]',
        ) ||
        locked
      )
        return;
      if (['q', 'ArrowLeft'].includes(e.key)) {
        e.preventDefault();
        step(-1);
      }
      if (['d', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        step(1);
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setFollow(false);
        if (index === frames.length - 1) setCursor(frames[0]?.at || 0);
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch(apiPath('/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const value: any = await r.json();
      if (!r.ok) throw Error(value.error);
      setPassword('');
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (locked)
    return (
      <main className="login">
        <Lock size={28} />
        <h1>FocusReplay</h1>
        <p>@{profile}</p>
        <form onSubmit={login}>
          <label htmlFor="password">Mot de passe du partage</label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button variant="tertiary" type="submit" isDisabled={busy}>
            Accéder au replay
          </Button>
        </form>
        <a href="/">Se connecter à mon compte</a>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const days = new Map((data?.days || []).map((d: any) => [d.day, d.workMs]));
  const calendar = Array.from({ length: 364 }, (_, i) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - 363 + i);
    const key =
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0');
    return { day: key, ms: Number(days.get(key) || 0) };
  });
  const status =
    data?.status === 'recording'
      ? 'En session'
      : data?.status === 'paused'
        ? 'En pause'
        : 'Hors ligne';
  return (
    <main className="profile">
      <header>
        <div>
          <a href="/">FocusReplay</a>
          <h1>@{profile}</h1>
          <span className={'status ' + data?.status}>{status}</span>
          {data?.syncedAt > 0 && <small>Mis à jour à {time(data.syncedAt)}</small>}
        </div>
        <Button
          type="submit"
          variant="ghost"
          onPress={async () => {
            await fetch(apiPath('/logout'), { method: 'POST' });
            await fetch('/api/account/logout', { method: 'POST' });
            setData(null);
            setLocked(true);
          }}
        >
          <LogOut />
          Fermer
        </Button>
      </header>
      <section className="activity">
        <strong>{hours(calendar.reduce((n, d) => n + d.ms, 0))} de travail</strong>
        <details>
          <summary>Activité des 12 derniers mois</summary>
          <div className="calendar" aria-label="Activité des douze derniers mois">
            {calendar.map((d) => (
              <span
                key={d.day}
                title={d.day + ' · ' + hours(d.ms)}
                style={{
                  opacity: d.ms ? Math.min(1, 0.3 + d.ms / 28800000) : 0.1,
                }}
                className={d.ms ? 'worked' : ''}
              />
            ))}
          </div>
        </details>
      </section>
      <nav className="days">
        <Button
          type="submit"
          aria-pressed={!day}
          variant="ghost"
          onPress={() => {
            setDay('');
            setFollow(true);
          }}
        >
          Dernières sessions
        </Button>
        {[...new Set((data?.frames || []).map((f: any) => f.day))].reverse().map((d: any) => (
          <Button
            type="submit"
            key={d}
            aria-pressed={day === d}
            variant="ghost"
            onPress={() => {
              setDay(d);
              setFollow(false);
              setCursor(null);
            }}
          >
            {d}
          </Button>
        ))}
      </nav>
      <section className="screen">
        {!frame ? (
          <p>Aucune session partagée pour le moment.</p>
        ) : gap ? (
          <p>{gap.label}</p>
        ) : frame.private ? (
          <p>
            <Lock /> Données privées
          </p>
        ) : frame.available === false ? (
          <p>
            <Lock /> Écran masqué ou image indisponible
          </p>
        ) : (
          <CaptureImage
            key={frame.id}
            id={frame.id}
            syncedAt={data.syncedAt}
            alt={'Capture à ' + time(frame.at)}
          />
        )}
        {!gap && !frame?.private && frame?.cameraAvailable && (
          <div className="replay-camera">
            <CaptureImage
              key={frame.id + 'camera'}
              id={frame.id}
              source="camera"
              syncedAt={data.syncedAt}
              alt={'Caméra à ' + time(frame.at)}
            />
          </div>
        )}
        {frame && !frame.private && (
          <div className="replay-visibility">
            <Chip>
              {frame.screenMode === 'blurred'
                ? 'Écran flouté'
                : frame.available === false
                  ? 'Écran masqué'
                  : 'Écran visible'}
            </Chip>
            {frame.cameraAvailable && (
              <Chip>{frame.cameraMode === 'blurred' ? 'Caméra floutée' : 'Caméra visible'}</Chip>
            )}
          </div>
        )}
      </section>
      {frame && (
        <>
          <div className="transport">
            <span>
              {time(position)} · {frame.private ? 'Données privées' : frame.app}
            </span>
            <div>
              <Button
                type="submit"
                variant="ghost"
                aria-label="Image précédente"
                onPress={() => step(-1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="tertiary"
                type="submit"
                aria-label={playing ? 'Pause du replay' : 'Lire le replay'}
                onPress={() => {
                  setFollow(false);
                  if (index === frames.length - 1) setCursor(frames[0].at);
                  setPlaying(!playing);
                }}
              >
                {playing ? <Pause /> : <Play />}
              </Button>
              <Button
                type="submit"
                variant="ghost"
                aria-label="Image suivante"
                onPress={() => step(1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <Button
              type="submit"
              variant={follow ? 'primary' : 'outline'}
              onPress={() => {
                setFollow(true);
                setPlaying(false);
              }}
            >
              Live · dernière capture
            </Button>
          </div>
          <div className="replay-adjustments">
            <label>
              Lecture · {speed} img/s
              <Slider
                aria-label="Vitesse de lecture"
                minValue={1}
                maxValue={8}
                step={1}
                value={speed}
                onChange={(v) => setSpeed(Array.isArray(v) ? v[0] : v)}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
            </label>
            <label>
              Zoom · ×{zoom.toFixed(1)}
              <Slider
                aria-label="Zoom de la timeline"
                minValue={1}
                maxValue={8}
                step={0.25}
                value={zoom}
                onChange={(v) => setZoom(Array.isArray(v) ? v[0] : v)}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
            </label>
            <small>
              {frame.at ? 'Capture du ' + new Date(frame.at).toLocaleString('fr-FR') : ''}
            </small>
          </div>
          <div className="replay-timeline-scroll" ref={timeline}>
            <div className="replay-timeline-content" style={{ width: zoom * 100 + '%' }}>
              <Slider
                aria-label="Timeline du replay"
                minValue={frames[0].at}
                maxValue={Math.max(frames[0].at + 1, frames.at(-1).at)}
                value={position}
                onChange={(value) => {
                  setCursor(Array.isArray(value) ? value[0] : value);
                  setFollow(false);
                  setPlaying(false);
                }}
              >
                <Slider.Track>
                  <Slider.Fill />
                  <Slider.Thumb />
                </Slider.Track>
              </Slider>
              <div
                className="replay-playhead"
                aria-hidden="true"
                style={{
                  left:
                    (100 * (position - frames[0].at)) /
                      Math.max(1, frames.at(-1).at - frames[0].at) +
                    '%',
                }}
              >
                <span>{time(position)}</span>
              </div>
              <div className="software-track" aria-label="Logiciels utilisés">
                {replayGroups(
                  data.overview || [],
                  frames[0].at,
                  frames.at(-1).at,
                  zoom * Math.min(1, viewportWidth / 1200),
                ).map((a: any) => (
                  <button
                    key={a.from}
                    title={time(a.from) + '–' + time(a.to) + '\n' + a.title}
                    className={a.category}
                    style={{
                      left:
                        Math.max(
                          0,
                          ((a.from - frames[0].at) / Math.max(1, frames.at(-1).at - frames[0].at)) *
                            100,
                        ) + '%',
                      width:
                        Math.max(
                          0,
                          ((Math.min(a.to, frames.at(-1).at) - Math.max(a.from, frames[0].at)) /
                            Math.max(1, frames.at(-1).at - frames[0].at)) *
                            100,
                        ) + '%',
                    }}
                    onClick={() => {
                      setCursor(a.from);
                      setFollow(false);
                    }}
                  >
                    {a.app}
                  </button>
                ))}
              </div>
              <div
                className="filmstrip"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const r = e.currentTarget.getBoundingClientRect();
                  setCursor(
                    frames[0].at +
                      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) *
                        (frames.at(-1).at - frames[0].at),
                  );
                  setFollow(false);
                  setPlaying(false);
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setCursor(
                    frames[0].at +
                      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) *
                        (frames.at(-1).at - frames[0].at),
                  );
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onClickCapture={(e) => {
                  if (e.detail > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.ceil(Math.max(4, Math.min(12, Math.floor(viewportWidth / 100))) * zoom)},1fr)`,
                }}
              >
                {Array.from(
                  {
                    length: Math.ceil(
                      Math.max(4, Math.min(12, Math.floor(viewportWidth / 100))) * zoom,
                    ),
                  },
                  (_, i) => {
                    const at =
                      frames[0].at +
                      ((frames.at(-1).at - frames[0].at) * i) /
                        Math.max(
                          1,
                          Math.ceil(
                            Math.max(4, Math.min(12, Math.floor(viewportWidth / 100))) * zoom,
                          ) - 1,
                        );
                    const f = frames.findLast((f: any) => f.at <= at) || frames[0];
                    const pause = (data.gaps || []).find((g: any) => at >= g.from && at < g.to);
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          setCursor(at);
                          setFollow(false);
                        }}
                        title={time(at)}
                        className={pause ? 'replay-gap' : ''}
                      >
                        {pause ? (
                          <strong>{pause.label}</strong>
                        ) : f.private || f.available === false ? (
                          <Lock />
                        ) : (
                          <CaptureImage id={f.id} syncedAt={data.syncedAt} lazy />
                        )}
                        <span>{time(at)}</span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          </div>
        </>
      )}
      <section className="sessions">
        {(data?.sessions || []).map((s: any) => (
          <div key={s.id}>
            <strong>
              {s.day} · {time(s.startedAt)}
            </strong>
            <span>{hours(s.workMs)} de travail</span>
            <span>
              {s.status === 'recording'
                ? 'En session'
                : s.status === 'paused'
                  ? 'En pause'
                  : 'Terminée'}
            </span>
          </div>
        ))}
      </section>
      {error && <p role="status">{error}</p>}
    </main>
  );
}
