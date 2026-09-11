'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
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
}: {
  id: string;
  syncedAt: number;
  alt?: string;
  lazy?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      loading={lazy ? 'lazy' : 'eager'}
      src={apiPath('/image/' + id) + (failed ? '?retry=' + syncedAt : '')}
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
  async function refresh() {
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
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
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
    }, 500);
    return () => clearTimeout(t);
  }, [playing, index, frames.length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea') || locked) return;
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
          <Button disabled={busy}>Accéder au replay</Button>
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
          variant="ghost"
          onClick={async () => {
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
        <small>12 derniers mois · une case par jour</small>
      </section>
      <nav className="days">
        <Button
          variant={!day ? 'default' : 'outline'}
          onClick={() => {
            setDay('');
            setFollow(true);
          }}
        >
          Dernières sessions
        </Button>
        {[...new Set((data?.frames || []).map((f: any) => f.day))].reverse().map((d: any) => (
          <Button
            key={d}
            variant={day === d ? 'default' : 'outline'}
            onClick={() => {
              setDay(d);
              setFollow(false);
              setCursor(null);
            }}
          >
            {d}
          </Button>
        ))}
      </nav>
      <p className="history-caption">
        90 jours maximum · les captures anciennes sont progressivement espacées
      </p>
      <section className="screen">
        {!frame ? (
          <p>Aucune session partagée pour le moment.</p>
        ) : gap ? (
          <p>{gap.label}</p>
        ) : frame.private ? (
          <p>
            <Lock /> Données privées
          </p>
        ) : (
          <CaptureImage
            key={frame.id}
            id={frame.id}
            syncedAt={data.syncedAt}
            alt={'Capture à ' + time(frame.at)}
          />
        )}
      </section>
      {frame && (
        <>
          <div className="transport">
            <span>
              {time(position)} · {frame.private ? 'Données privées' : frame.app}
            </span>
            <div>
              <Button variant="ghost" aria-label="Image précédente" onClick={() => step(-1)}>
                <ChevronLeft />
              </Button>
              <Button
                aria-label={playing ? 'Pause du replay' : 'Lire le replay'}
                onClick={() => {
                  setFollow(false);
                  if (index === frames.length - 1) setCursor(frames[0].at);
                  setPlaying(!playing);
                }}
              >
                {playing ? <Pause /> : <Play />}
              </Button>
              <Button variant="ghost" aria-label="Image suivante" onClick={() => step(1)}>
                <ChevronRight />
              </Button>
            </div>
            <Button
              variant={follow ? 'default' : 'outline'}
              onClick={() => {
                setFollow(true);
                setPlaying(false);
              }}
            >
              Dernière image
            </Button>
          </div>
          <Slider
            aria-label="Timeline du replay"
            min={frames[0].at}
            max={Math.max(frames[0].at + 1, frames.at(-1).at)}
            value={[position]}
            onValueChange={([value]) => {
              setCursor(value);
              setFollow(false);
              setPlaying(false);
            }}
          />
          <div
            className="software-track"
            aria-label="Logiciels dominants par période de cinq minutes"
          >
            {(data.overview || [])
              .filter((a: any) => a.to >= frames[0].at && a.from <= frames.at(-1).at)
              .map((a: any) => (
                <button
                  key={a.from}
                  title={a.app + ' · ' + time(a.from) + '–' + time(a.to)}
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
          <div className="filmstrip">
            {frames
              .filter((_: any, i: number) => i % Math.max(1, Math.floor(frames.length / 20)) === 0)
              .map((f: any) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setCursor(f.at);
                    setFollow(false);
                  }}
                  title={time(f.at)}
                >
                  {f.private ? <Lock /> : <CaptureImage id={f.id} syncedAt={data.syncedAt} lazy />}
                  <span>{time(f.at)}</span>
                </button>
              ))}
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
