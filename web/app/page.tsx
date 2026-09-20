'use client';
import {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useMemo,
  useContext,
  createContext,
} from 'react';
import { ReplayMediaCache, loadReplayBatch } from '@/lib/replay-cache';
import ReplaySurface from '@/components/replay-surface';
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
const MediaContext = createContext<ReplayMediaCache | null>(null);
const todayKey = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
};
const mediaUrl = (id: string, source = 'screen', mode = 'visible') =>
  apiPath('/image/' + id) + '?source=' + source + '&mode=' + mode;
function CaptureImage({
  id,
  syncedAt,
  alt = '',
  lazy = false,
  source = 'screen',
  mode = 'visible',
}: {
  id: string;
  syncedAt: number;
  alt?: string;
  lazy?: boolean;
  source?: string;
  mode?: string;
}) {
  const cache = useContext(MediaContext)!;
  const key = mediaUrl(id, source, mode);
  const [url, setUrl] = useState(() => cache?.peek(key));
  const [failed, setFailed] = useState(false);
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(!lazy);
  useEffect(() => {
    if (!lazy || !host.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [lazy]);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setFailed(false);
    setUrl(cache.peek(key));
    cache
      .load(key, !lazy)
      .then((url) => {
        if (active) setUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [cache, key, syncedAt, lazy, visible]);
  return url ? (
    <img src={url} alt={alt} decoding="async" />
  ) : (
    <span ref={host} className="capture-loading" role={lazy ? undefined : 'status'}>
      {failed ? 'Image non reçue' : lazy ? '' : 'Chargement…'}
    </span>
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
  const cache = useMemo(() => new ReplayMediaCache(1600, 2, loadReplayBatch), [profile]);
  useEffect(() => () => cache.clear(), [cache]);
  const [day, setDay] = useState('today'),
    [cursor, setCursor] = useState<number | null>(null),
    [follow, setFollow] = useState(true),
    [playing, setPlaying] = useState(false);
  const [dayLoading, setDayLoading] = useState(false);
  const [buffer, setBuffer] = useState<{ ready: number; total: number } | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [viewportWidth, setViewportWidth] = useState(1200);
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth);
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const [speed, setSpeed] = useState(4),
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
        cache.clear();
        setLocked(true);
        setData(null);
        return;
      }
      if (!r.ok) throw Error('Connexion temporairement indisponible.');
      const next: any = await r.json();
      const allowed = new Set<string>();
      for (const f of next.frames || [])
        if (!f.private) {
          if (f.available !== false) allowed.add(mediaUrl(f.id, 'screen', f.screenMode));
          if (f.cameraAvailable) allowed.add(mediaUrl(f.id, 'camera', f.cameraMode));
        }
      cache.retain(allowed);
      setData(next);
      setLocked(false);
      setError('');
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    refresh();

    document.addEventListener('visibilitychange', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  const pendingImages = (data?.frames || []).some(
    (f: any) => !f.private && f.screenMode !== 'hidden' && f.available === false,
  );
  useEffect(() => {
    if (locked) return;
    const t = setInterval(refresh, pendingImages ? 15000 : 180000);
    return () => clearInterval(t);
  }, [locked, pendingImages]);
  const selectedDay = day === 'today' ? todayKey() : day;
  const frames = useMemo(
    () =>
      (data?.frames || [])
        .filter((f: any) => f.day === selectedDay)
        .sort((a: any, b: any) => a.at - b.at),
    [data, selectedDay],
  );
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
  useEffect(() => {
    if (locked || playing || document.hidden) return;
    const nearby = frames.slice(Math.max(0, index - 4), index + 49);
    for (const f of nearby)
      if (!f.private) {
        if (f.available !== false)
          void cache.load(mediaUrl(f.id, 'screen', f.screenMode)).catch(() => {});
        if (f.cameraAvailable)
          void cache.load(mediaUrl(f.id, 'camera', f.cameraMode)).catch(() => {});
      }
  }, [cache, index, data, locked, selectedDay, playing]);
  const nearest = (source: string) =>
    frames
      .filter(
        (f: any) =>
          !f.private &&
          (source === 'camera'
            ? f.cameraAvailable && f.cameraMode === frame?.cameraMode
            : f.available !== false && f.screenMode === frame?.screenMode),
      )
      .map((f: any) => ({
        key: mediaUrl(f.id, source, source === 'camera' ? f.cameraMode : f.screenMode),
        distance: Math.abs(f.at - position),
      }))
      .filter((f: any) => cache.peek(f.key))
      .sort((a: any, b: any) => a.distance - b.distance)[0]?.key;
  useEffect(() => {
    if (locked || document.hidden) return;
    let active = true;
    setDayLoading(true);
    const keys = frames
      .filter((f: any) => !f.private)
      .flatMap((f: any) => [
        ...(f.available !== false ? [mediaUrl(f.id, 'screen', f.screenMode)] : []),
        ...(f.cameraAvailable ? [mediaUrl(f.id, 'camera', f.cameraMode)] : []),
      ]);
    void Promise.allSettled(keys.map((key: string) => cache.load(key))).then(() => {
      if (active) setDayLoading(false);
    });
    return () => {
      active = false;
    };
  }, [data, selectedDay, locked, cache]);
  const gap = (data?.gaps || []).find((g: any) => position >= g.from && position < g.to);
  const step = (n: number) => {
    setPlaying(false);
    setFollow(false);
    setCursor(frames[Math.max(0, Math.min(frames.length - 1, index + n))]?.at || 0);
  };
  useEffect(() => {
    if (!playing) {
      setBuffer(null);
      return;
    }
    let active = true,
      current = index,
      timer: ReturnType<typeof setTimeout>;
    const attempted = new Set<string>();
    const keysFor = (f: any): string[] =>
      !f || f.private
        ? []
        : [
            ...(f.available !== false ? [mediaUrl(f.id, 'screen', f.screenMode)] : []),
            ...(f.cameraAvailable ? [mediaUrl(f.id, 'camera', f.cameraMode)] : []),
          ];
    const fill = async (from: number) => {
      const keys = frames.slice(from, from + Math.max(24, speed * 6)).flatMap(keysFor);
      let ready = keys.filter((key: string) => cache.peek(key) || attempted.has(key)).length;
      if (ready < keys.length) setBuffer({ ready, total: keys.length });
      await Promise.allSettled(
        keys.map(async (key: string) => {
          if (cache.peek(key) || attempted.has(key)) return;
          try {
            await cache.load(key, true);
          } catch {
            attempted.add(key);
          } finally {
            ready++;
            if (active) setBuffer({ ready, total: keys.length });
          }
        }),
      );
      if (active) setBuffer(null);
    };
    void (async () => {
      await fill(current);
      let deadline = performance.now();
      while (active && current < frames.length - 1) {
        const next = frames[current + 1];
        if (keysFor(next).some((key) => !cache.peek(key) && !attempted.has(key)))
          await fill(current + 1);
        if (!active) break;
        await Promise.allSettled(
          keysFor(next)
            .filter((key) => !attempted.has(key))
            .map((key) => cache.decoded(key)),
        );
        deadline = Math.max(deadline + 1000 / speed, performance.now());
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, Math.max(0, deadline - performance.now()));
        });
        if (!active) break;
        current++;
        setFollow(false);
        setCursor(next.at);
        for (const upcoming of frames.slice(current + 1, current + 7))
          for (const key of keysFor(upcoming))
            if (!attempted.has(key)) void cache.decoded(key).catch(() => attempted.add(key));
      }
      if (active) setPlaying(false);
    })();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [playing, speed, selectedDay, cache, data]);
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
    <MediaContext.Provider value={cache}>
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
              cache.clear();
              setData(null);
              setLocked(true);
            }}
          >
            <LogOut />
            Fermer
          </Button>
        </header>
        <div className="replay-editor">
          <nav className="days">
            <Button
              type="submit"
              aria-pressed={day === 'today'}
              variant="ghost"
              onPress={() => {
                setPlaying(false);
                setDay('today');
                setFollow(true);
              }}
            >
              Aujourd’hui
            </Button>
            {[...new Set((data?.frames || []).map((f: any) => f.day))]
              .filter((d) => d !== todayKey())
              .sort()
              .reverse()
              .map((d: any) => (
                <Button
                  type="submit"
                  key={d}
                  aria-pressed={day === d}
                  variant="ghost"
                  onPress={() => {
                    setPlaying(false);
                    setDay(d);
                    setFollow(false);
                    setCursor(null);
                  }}
                >
                  {new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Button>
              ))}
            <span className="replay-day-total">
              {hours(
                (data?.sessions || [])
                  .filter((s: any) => s.day === selectedDay)
                  .reduce((n: number, s: any) => n + (s.workMs || 0), 0),
              )}{' '}
              de travail
            </span>
          </nav>
          <section className="screen">
            {buffer && (
              <div className="replay-buffer" role="status">
                <span>Préparation de la lecture</span>
                <progress value={buffer.ready} max={buffer.total} />
                <small>{Math.round((buffer.ready / Math.max(1, buffer.total)) * 100)} %</small>
              </div>
            )}
            {!frame ? (
              <p>Aucune capture partagée pour cette journée.</p>
            ) : gap ? (
              <p>{gap.label}</p>
            ) : frame.private ? (
              <p>
                <Lock /> Données privées
              </p>
            ) : frame.available === false ? (
              <p>
                <Lock />{' '}
                {frame.screenMode === 'hidden'
                  ? 'Écran masqué par le propriétaire'
                  : 'Capture pas encore envoyée par l’application'}
              </p>
            ) : (
              <ReplaySurface
                key={selectedDay + frame.screenMode}
                cache={cache}
                mediaKey={mediaUrl(frame.id, 'screen', frame.screenMode)}
                fallbackKey={nearest('screen')}
                revision={data.syncedAt}
                alt={'Capture à ' + time(frame.at)}
              />
            )}
            {!gap && !frame?.private && frame?.cameraAvailable && (
              <div className="replay-camera">
                <ReplaySurface
                  key={selectedDay + frame.cameraMode}
                  cache={cache}
                  mediaKey={mediaUrl(frame.id, 'camera', frame.cameraMode)}
                  fallbackKey={nearest('camera')}
                  revision={data.syncedAt}
                  alt={'Caméra à ' + time(frame.at)}
                />
              </div>
            )}
            {frame && !frame.private && !gap && (
              <div className="replay-visibility">
                <Chip>
                  {frame.screenMode === 'blurred'
                    ? 'Écran flouté'
                    : frame.screenMode === 'hidden'
                      ? 'Écran masqué'
                      : frame.available === false
                        ? 'Image en attente'
                        : 'Écran visible'}
                </Chip>
                {frame.cameraAvailable && (
                  <Chip>
                    {frame.cameraMode === 'blurred' ? 'Caméra floutée' : 'Caméra visible'}
                  </Chip>
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
                  Dernière capture
                </Button>
              </div>
              <div className="replay-adjustments">
                <Button
                  size="sm"
                  variant="ghost"
                  isDisabled={dayLoading}
                  onPress={async () => {
                    setDayLoading(true);
                    try {
                      await Promise.allSettled(
                        frames
                          .filter((f: any) => !f.private)
                          .flatMap((f: any) => [
                            ...(f.available !== false
                              ? [mediaUrl(f.id, 'screen', f.screenMode)]
                              : []),
                            ...(f.cameraAvailable ? [mediaUrl(f.id, 'camera', f.cameraMode)] : []),
                          ])
                          .map((key: string) => cache.load(key)),
                      );
                    } finally {
                      setDayLoading(false);
                    }
                  }}
                >
                  {dayLoading ? 'Préchargement…' : 'Précharger la journée'}
                </Button>
                {selectedGroup && (
                  <div
                    className="replay-group-detail"
                    role="region"
                    aria-label="Détail des logiciels"
                  >
                    <header>
                      <strong>
                        {time(selectedGroup.from)} – {time(selectedGroup.to)}
                      </strong>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => setSelectedGroup(null)}
                        aria-label="Fermer le détail"
                      >
                        ×
                      </Button>
                    </header>
                    {selectedGroup.parts.map((part: any) => (
                      <div key={part.app}>
                        <span>{part.app}</span>
                        <strong>{Math.max(1, Math.round(part.ms / 60000))} min</strong>
                        <i
                          style={{
                            width:
                              (100 * part.ms) / Math.max(1, selectedGroup.to - selectedGroup.from) +
                              '%',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <label>
                  Lecture · {speed} img/s
                  <Slider
                    aria-label="Vitesse de lecture"
                    minValue={4}
                    maxValue={30}
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
                  <div className="replay-ruler" aria-hidden="true">
                    {Array.from({ length: Math.round(8 * zoom) + 1 }, (_, i) => (
                      <time key={i}>
                        {time(
                          frames[0].at +
                            ((frames.at(-1).at - frames[0].at) * i) / Math.round(8 * zoom),
                        )}
                      </time>
                    ))}
                  </div>
                  <Slider
                    className="replay-seek"
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
                      data.gaps || [],
                    ).map((a: any) => (
                      <button
                        key={a.from}
                        title={time(a.from) + '–' + time(a.to) + '\n' + a.title}
                        className={a.category}
                        style={{
                          left:
                            Math.max(
                              0,
                              ((a.from - frames[0].at) /
                                Math.max(1, frames.at(-1).at - frames[0].at)) *
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
                          setPlaying(false);
                          setSelectedGroup(a);
                          setCursor(a.from);
                          setFollow(false);
                        }}
                      >
                        <span>{a.app}</span>
                        <small>{Math.max(1, Math.round((a.to - a.from) / 60000))} min</small>
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
                              <CaptureImage
                                id={f.id}
                                syncedAt={data.syncedAt}
                                mode={f.screenMode}
                                lazy
                              />
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
        </div>
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
        <section className="sessions">
          {(data?.sessions || [])
            .filter(
              (s: any) =>
                s.day === selectedDay ||
                new Date(s.startedAt).toLocaleDateString('en-CA') === selectedDay,
            )
            .map((s: any) => (
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
    </MediaContext.Provider>
  );
}
