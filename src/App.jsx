import { Button } from './Hero';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Profile from './Profile';
import SettingsView from './SettingsView';
import Timeline from './Timeline';
import AppIcon from './AppIcon';
import { sessionGaps, sessionTime } from './activity-overview.mjs';

import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Settings,
  Sun,
  Moon,
  Circle,
  CircleDot,
  Clapperboard,
  Download,
  ChevronLeft,
  ArrowRight,
  Monitor,
  Music2,
  Volume2,
  Trash2,
  Maximize,
  ZoomIn,
  X,
  AlertCircle,
  FolderOpen,
  Check,
  Radio,
  Eye,
  Clock3,
  ShieldCheck,
  EyeOff,
  Film,
  Activity,
  RotateCcw,
} from 'lucide-react';
import {
  labels,
  dayKey,
  time,
  shortTime,
  duration,
  frameAt,
  summarize,
  mergeSegments,
} from './lib.mjs';
import './styles.css';
import { Camera, CameraOff, Gift } from 'lucide-react';
import { useCamera } from './useCamera';
import { Rewards, BreakBanner } from './Rewards';
import { playChime } from './chime';
import { useMusic } from './useMusic';
import { useSoundDesign } from './sounds';
const api = window.focusReplay;
const imageUrl = (f) => (f ? `focusmedia://capture/${f.id}` : '');
const sessionName = (s) => `Session de ${shortTime(s.startedAt)}`;
function IconButton({ icon: Icon, label, ...props }) {
  return (
    <Button className="icon-button" aria-label={label} title={label} {...props}>
      <Icon size={18} />
    </Button>
  );
}
export default function App() {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [view, setView] = useState('replay');
  const [day, setDay] = useState(dayKey(Date.now())),
    [selectedSession, setSelectedSession] = useState(null),
    [cursor, setCursor] = useState(null),
    [follow, setFollow] = useState(false),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(2),
    [timelineZoom, setTimelineZoom] = useState(1);
  const [clock, setClock] = useState(Date.now()),
    [exportState, setExportState] = useState(null),
    [confirmDelete, setConfirmDelete] = useState(null),
    [loadedImage, setLoadedImage] = useState(''),
    [brokenImage, setBrokenImage] = useState('');

  const latest = useRef({});
  const widget = location.hash === '#widget';
  const cameraStatus = useCamera(data, widget);
  const { audio, musicStatus, musicPlaying, stopMusic, musicEnded } = useMusic(
    Boolean(data),
    widget,
  );

  const [pauseMenu, setPauseMenu] = useState(false),
    [pauseMinutes, setPauseMinutes] = useState(5);
  const act = async (fn) => {
    setError('');
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!api) {
      setError('Ouvrez FocusReplay depuis son application Windows.');
      return;
    }
    api
      .state()
      .then((s) => {
        setData(s);
        setExportState(s.exportState);
      })
      .catch((e) => setError(e.message));
    const off = api.onChange(setData),
      offExport = api.onExport(setExportState);
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => {
      off();
      offExport();
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (!api || widget) return;
    const offBreak = api.onBreakEnded(playChime);
    const offCheckin = api.onCheckinSound(playChime);
    return () => {
      offBreak();
      offCheckin();
    };
  }, []);
  const active = data?.sessions.find((s) => !s.endedAt);
  const paused = active && (active.status === 'paused' || data.systemPaused);
  const settings = data?.settings;
  const wasPaused = useRef(false);
  useEffect(() => {
    if (wasPaused.current && active && !paused) {
      setDay(dayKey(Date.now()));
      setSelectedSession(active.id);
      setCursor(null);
      setFollow(true);
      setPlaying(false);
      setPauseMenu(false);
    }
    wasPaused.current = Boolean(paused);
  }, [paused, active?.id]);
  useEffect(() => {
    if (widget) api?.widgetExpand?.(Boolean(paused))?.catch(() => {});
  }, [widget, paused]);
  useSoundDesign(settings);
  useEffect(() => {
    if (!settings) return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      (document.documentElement.dataset.theme =
        settings.theme === 'system' ? (media.matches ? 'dark' : 'light') : settings.theme);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings?.theme]);
  const sessions = useMemo(
    () =>
      data?.sessions
        .filter(
          (s) =>
            dayKey(s.startedAt) === day ||
            s.frames.some((f) => dayKey(f.at) === day) ||
            s.activity.some((a) => dayKey(a.from) === day) ||
            s.events?.some((e) => e.type === 'checkin' && dayKey(e.at) === day),
        )
        .sort((a, b) => b.startedAt - a.startedAt) || [],
    [data, day],
  );
  const selected = data?.sessions.find((s) => s.id === selectedSession);
  const frames = useMemo(
    () =>
      sessions
        .filter((s) => !selectedSession || s.id === selectedSession)
        .flatMap((s) => s.frames.map((f) => ({ ...f, sessionId: s.id })))
        .filter((f) => dayKey(f.at) === day)
        .sort((a, b) => a.at - b.at),
    [sessions, selectedSession, day],
  );
  const segments = useMemo(
    () =>
      sessions
        .filter((s) => !selectedSession || s.id === selectedSession)
        .flatMap((s) => s.activity)
        .filter((a) => dayKey(a.from) === day),
    [sessions, selectedSession, day],
  );
  const stats = useMemo(() => summarize(segments), [segments]);
  const softwareSegments = useMemo(() => mergeSegments(segments), [segments]);
  const current = follow || cursor === null ? frames.at(-1) : frameAt(frames, cursor);
  const index = current ? frames.findIndex((f) => f.id === current.id) : -1;
  const visibleSessions = sessions.filter((s) => !selectedSession || s.id === selectedSession);
  const dayStart = new Date(day + 'T00:00:00').getTime();
  const dayEnd = new Date(day + 'T23:59:59.999').getTime();
  const totals = sessionTime(visibleSessions, dayStart, Math.min(clock, dayEnd));
  const activeTime = active ? sessionTime([active], active.startedAt, clock).active : 0;
  const start = visibleSessions.length
    ? Math.max(dayStart, Math.min(...visibleSessions.map((s) => s.startedAt)))
    : 0;
  const checkinEntries = sessions
    .filter((s) => !selectedSession || s.id === selectedSession)
    .flatMap((s) => s.events || [])
    .filter((e) => e.type === 'checkin' && e.action !== 'dismiss' && dayKey(e.at) === day)
    .sort((a, b) => a.at - b.at);
  const end = Math.max(
    start + 1,
    frames.at(-1)?.at || 0,
    ...segments.map((a) => a.to),
    ...checkinEntries.map((e) => e.at),
    ...sessions
      .filter((s) => !selectedSession || s.id === selectedSession)
      .map((s) => Math.min(s.endedAt || clock, new Date(day + 'T23:59:59.999').getTime())),
  );
  const gaps = sessionGaps(
    sessions.filter((s) => !selectedSession || s.id === selectedSession),
    start,
    end,
    clock,
  );
  const playheadTime = follow
    ? end
    : cursor === null
      ? current?.at || start
      : Math.max(start, Math.min(end, cursor));
  const seek = (at) => {
    setFollow(false);
    setCursor(Number(at));
    setPlaying(false);
  };
  const step = (n) => {
    const f = frames[Math.max(0, Math.min(frames.length - 1, index + n))];
    if (f) seek(f.at);
  };
  const togglePlay = () => {
    if (!frames.length) return;
    setFollow(false);
    if (index === frames.length - 1) setCursor(frames[0].at);
    setPlaying((p) => !p);
  };
  latest.current = { frames, index, step, togglePlay, view };
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const { frames: f, index: i } = latest.current;
      if (i >= f.length - 1) setPlaying(false);
      else setCursor(f[i + 1].at);
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed]);
  useEffect(() => {
    const handler = (e) => {
      if (
        e.target.isContentEditable ||
        ['TEXTAREA', 'SELECT', 'AUDIO'].includes(e.target.tagName) ||
        (e.target.tagName === 'INPUT' && e.target.type !== 'range') ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        latest.current.view !== 'replay'
      )
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        latest.current.togglePlay();
      }
      if (
        e.target.tagName === 'INPUT' &&
        e.target.getAttribute('aria-label') !== 'Curseur de la timeline' &&
        !['q', 'd'].includes(e.key.toLowerCase())
      )
        return;
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'q') {
        e.preventDefault();
        latest.current.step(-1);
      }
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        e.preventDefault();
        latest.current.step(1);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
  // Preload neighbors for instant scrubbing without loading the entire archive into memory.
  useEffect(() => {
    for (const f of frames.slice(Math.max(0, index - 3), index + 5)) {
      const img = new Image();
      img.src = imageUrl(f);
    }
  }, [current?.id]);
  const begin = () =>
    act(async () => {
      const id = await api.start();
      setDay(dayKey(Date.now()));
      setSelectedSession(id);
      setCursor(null);
      setFollow(true);
      setView('replay');
    });
  const chooseSession = (id) => {
    setSelectedSession(id);
    setCursor(null);
    setFollow(false);
    setPlaying(false);
    setConfirmDelete(null);
    setView('replay');
  };
  const changeDay = (value) => {
    setDay(value);
    chooseSession(null);
  };
  if (!data)
    return (
      <main className="loading">
        <Clapperboard size={32} />
        <h1>FocusReplay</h1>
        <p>{error || 'Ouverture de votre espace local…'}</p>
      </main>
    );
  const resume = () =>
    act(async () => {
      if (active?.status === 'paused') await api.pause();
      setDay(dayKey(Date.now()));
      setSelectedSession(active?.id || null);
      setCursor(null);
      setFollow(true);
      setPlaying(false);
      setPauseMenu(false);
    });
  const takePause = (minutes) =>
    act(async () => {
      await api.pauseFor(minutes);
      setPauseMenu(false);
    });
  if (widget)
    return (
      <div className="widget-shell">
        <div className="widget">
          <div className="widget-drag">
            <CircleDot size={15} />
            <small>
              {paused ? 'Pause' : 'Session'} · {duration(activeTime)}
            </small>
          </div>
          <IconButton
            icon={paused ? Play : Pause}
            label={paused ? 'Reprendre' : 'Pause'}
            disabled={busy || data.systemPaused}
            onClick={() => (paused ? resume() : takePause(null))}
          />
        </div>
        {paused && (
          <div className="widget-pause" aria-label="Choisir une pause">
            <div className="pause-presets">
              {[2, 5, 10, 15, 60].map((m) => (
                <Button key={m} disabled={busy} onClick={() => takePause(m)}>
                  {m === 60 ? '1 h' : m + ' min'}
                </Button>
              ))}
              <Button disabled={busy} onClick={() => takePause(null)}>
                Sans limite
              </Button>
            </div>
            <form
              className="pause-custom"
              onSubmit={(e) => {
                e.preventDefault();
                takePause(Number(pauseMinutes));
              }}
            >
              <input
                aria-label="Durée personnalisée de pause"
                type="number"
                min="1"
                max="1440"
                required
                value={pauseMinutes}
                onChange={(e) => setPauseMinutes(e.target.value)}
              />
              <span>min</span>
              <Button disabled={busy}>Pause</Button>
            </form>
            <div className="widget-pause-footer">
              <small>
                {data.pauseTimer?.endsAt
                  ? 'Fin prévue à ' + time(data.pauseTimer.endsAt)
                  : 'Pause sans limite'}
              </small>
              <IconButton
                icon={Square}
                label="Terminer la session"
                disabled={busy}
                onClick={() => act(() => api.stop())}
              />
            </div>
          </div>
        )}
        {error && <small role="alert">{error}</small>}
      </div>
    );
  const statusText = !active
    ? 'Prêt'
    : paused
      ? data.systemPaused
        ? 'Suspendu par Windows'
        : 'Session en pause'
      : data.warning
        ? 'Capture à vérifier'
        : 'Capture active';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-symbol">
            <Clapperboard size={21} />
          </span>
          <strong>FocusReplay</strong>
        </div>
        <label className="date-field">
          <Clock3 size={16} />
          <input
            aria-label="Jour à revoir"
            type="date"
            value={day}
            max={dayKey(clock)}
            onChange={(e) => e.target.value && changeDay(e.target.value)}
          />
        </label>
        <Button
          className={`day-button ${!selectedSession && view === 'replay' ? 'selected' : ''}`}
          onClick={() => chooseSession(null)}
        >
          <span>
            <Film size={17} /> Toute la journée
          </span>
          <small>
            {sessions.reduce((n, s) => n + s.frames.filter((f) => dayKey(f.at) === day).length, 0)}
          </small>
        </Button>
        <nav className="session-list" aria-label="Sessions">
          {sessions.map((s) => (
            <Button
              key={s.id}
              className={`session-row ${selectedSession === s.id && view === 'replay' ? 'selected' : ''}`}
              onClick={() => chooseSession(s.id)}
            >
              <div>
                <span>{sessionName(s)}</span>
                {!s.endedAt && <span className={`record-dot ${paused ? 'is-paused' : ''}`} />}
              </div>
              <small>
                {shortTime(s.startedAt)} · {duration(sessionTime([s], s.startedAt, clock).active)}{' '}
                hors pauses · {s.frames.length} {s.frames.length === 1 ? 'image' : 'images'}
              </small>
              {s.status === 'interrupted' && <small>Interrompue, captures récupérées</small>}
            </Button>
          ))}
          {!sessions.length && <span />}
        </nav>
        <footer className="sidebar-footer">
          <Button
            className={view === 'profile' ? 'selected' : ''}
            onClick={() => {
              setView('profile');
              setPlaying(false);
            }}
          >
            <Activity size={17} /> Profil
          </Button>
          <Button
            className={view === 'rewards' ? 'selected' : ''}
            onClick={() => {
              setView('rewards');
              setPlaying(false);
            }}
          >
            <Gift size={17} /> Pauses & récompenses
          </Button>
          <Button
            className={view === 'settings' ? 'selected' : ''}
            onClick={() => {
              setView('settings');
              setPlaying(false);
            }}
          >
            <Settings size={17} /> Réglages
          </Button>
          <div className="local-note">
            <IconButton
              icon={settings.theme === 'dark' ? Sun : Moon}
              label={settings.theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
              onClick={() =>
                act(() => api.settings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }))
              }
            />
          </div>
        </footer>
      </aside>
      <main className={'main-content ' + (view === 'replay' ? 'replay-workspace' : '')}>
        <header className="session-bar">
          <div className="status">
            <span className={`record-dot ${!active || paused ? 'is-paused' : ''}`} />
            <span>{statusText}</span>
            {active && (
              <strong className="tabular" title="Durée hors pauses">
                {duration(activeTime)}
              </strong>
            )}
          </div>
          <div className="session-actions">
            {settings.cameraEnabled && (
              <span className="camera-status">
                <Camera size={15} />
                {cameraStatus === 'ready'
                  ? 'Caméra active'
                  : cameraStatus === 'opening'
                    ? 'Caméra…'
                    : cameraStatus === 'error'
                      ? 'Caméra indisponible'
                      : 'Caméra autorisée'}
              </span>
            )}
            {musicPlaying && (
              <Button onClick={stopMusic}>
                <Volume2 size={16} /> Couper la musique
              </Button>
            )}
            {!active && (
              <Button className="primary" disabled={busy} onClick={begin}>
                <Play size={16} /> Commencer une session
              </Button>
            )}
            {active && (
              <>
                <Button
                  disabled={busy || data.systemPaused}
                  onClick={() => (paused ? resume() : setPauseMenu((p) => !p))}
                >
                  {paused ? <Play size={16} /> : <Pause size={16} />}{' '}
                  {paused ? 'Reprendre' : 'Pause'}
                </Button>
                <Button
                  className="stop-button"
                  disabled={busy}
                  onClick={() => act(() => api.stop())}
                >
                  <Square size={13} fill="currentColor" /> Terminer
                </Button>
              </>
            )}
          </div>
        </header>
        <>
          {pauseMenu && active && !paused && (
            <section className="pause-menu" aria-label="Choisir une pause">
              <div className="section-title">
                <div>
                  <h2>On souffle un peu ?</h2>
                  <p>La capture d’écran et la caméra s’arrêtent pendant la pause.</p>
                </div>
                <IconButton
                  icon={X}
                  label="Fermer le menu de pause"
                  onClick={() => setPauseMenu(false)}
                />
              </div>
              <div className="pause-presets">
                {[2, 5, 10, 15, 60].map((minutes) => (
                  <Button
                    key={minutes}
                    onClick={() =>
                      act(async () => {
                        await api.pauseFor(minutes);
                        setPauseMenu(false);
                      })
                    }
                  >
                    {minutes === 60 ? '1 h' : minutes + ' min'}
                  </Button>
                ))}
                <Button
                  onClick={() =>
                    act(async () => {
                      await api.pauseFor(null);
                      setPauseMenu(false);
                    })
                  }
                >
                  Sans limite
                </Button>
              </div>
              <form
                className="pause-custom"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    await api.pauseFor(Number(pauseMinutes));
                    setPauseMenu(false);
                  });
                }}
              >
                <label>
                  Autre durée{' '}
                  <input
                    aria-label="Durée personnalisée de pause"
                    type="number"
                    min="1"
                    max="1440"
                    required
                    value={pauseMinutes}
                    onChange={(e) => setPauseMinutes(e.target.value)}
                  />{' '}
                  min
                </label>
                <Button type="submit">Commencer cette pause</Button>
              </form>
              <p className="hint">Son et notification à la fin. La reprise reste manuelle.</p>
            </section>
          )}
        </>
        {(error || data.warning) && (
          <div className="notice error" role="alert">
            <AlertCircle size={18} />
            <span>{error || data.warning}</span>
            {error && (
              <IconButton icon={X} label="Fermer le message" onClick={() => setError('')} />
            )}
          </div>
        )}
        <BreakBanner
          wallet={data.wallet}
          pauseTimer={data.pauseTimer}
          clock={clock}
          act={act}
          onResume={resume}
        />
        {musicStatus.error && view !== 'settings' && (
          <div className="notice" role="status">
            <Music2 size={17} />
            <span>{musicStatus.error}</span>
            <Button onClick={() => setView('settings')}>Musique</Button>
          </div>
        )}
        {data.cameraWarning && settings.cameraEnabled && active && (
          <div className="notice" role="status">
            <CameraOff size={17} />
            <span>{data.cameraWarning}</span>
          </div>
        )}
        {view === 'profile' ? (
          <Profile data={data} busy={busy} act={act} onBack={() => setView('replay')} />
        ) : view === 'rewards' ? (
          <Rewards
            data={data}
            clock={clock}
            act={act}
            busy={busy}
            onBack={() => setView('replay')}
          />
        ) : view === 'settings' ? (
          <SettingsView
            settings={settings}
            data={data}
            busy={busy}
            act={act}
            onBack={() => setView('replay')}
            musicStatus={musicStatus}
          />
        ) : (
          <>
            <div className="page-heading">
              <div>
                <h1>
                  {selected
                    ? sessionName(selected)
                    : day === dayKey(clock)
                      ? 'Votre journée'
                      : new Date(day + 'T12:00:00').toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                        })}
                </h1>
              </div>
              <Button
                disabled={!frames.length || exportState?.status === 'running' || busy}
                onClick={() =>
                  act(() =>
                    api.export({
                      day,
                      sessionId: selectedSession || undefined,
                      fps: speed,
                      height: 1080,
                      includeCamera: true,
                    }),
                  )
                }
              >
                <Download size={17} /> Exporter en MP4
              </Button>
            </div>
            {exportState && (
              <div
                className={`notice export-notice ${exportState.status === 'error' ? 'error' : ''}`}
                role="status"
              >
                {exportState.status === 'running' ? (
                  <>
                    <Download size={18} />
                    <span>Création du replay · {exportState.progress} %</span>
                    <progress max="100" value={exportState.progress} />
                    <Button onClick={() => api.cancelExport()}>Annuler</Button>
                  </>
                ) : exportState.status === 'done' ? (
                  <>
                    <Check size={18} />
                    <span>Vidéo prête : {exportState.name}</span>
                    <Button onClick={() => api.openExport()}>
                      <FolderOpen size={16} /> Voir le fichier
                    </Button>
                  </>
                ) : (
                  <>
                    <AlertCircle size={18} />
                    <span>{exportState.message}</span>
                  </>
                )}
              </div>
            )}
            {!frames.length ? (
              <section className="empty-state">
                <div className="empty-reel">
                  <Film size={42} />
                  <span />
                  <span />
                  <span />
                </div>
                <p>{active ? 'Première capture…' : 'Aucune capture'}</p>
                {!active && (
                  <Button className="primary large" onClick={begin} disabled={busy}>
                    <Play size={17} fill="currentColor" /> Commencer
                  </Button>
                )}
              </section>
            ) : (
              <>
                <section className="replay-stage" aria-label="Prévisualisation de la capture">
                  <Button
                    className="preview-privacy-action"
                    disabled={busy}
                    title={(current.privacyReasons || []).join(' · ')}
                    onClick={() =>
                      current.private
                        ? act(() => api.shareMask(current.id, false))
                        : current.sharedPrivate
                          ? setView('profile')
                          : act(() => api.shareMask(current.id))
                    }
                  >
                    {current.sharedPrivate
                      ? current.private
                        ? 'Démasquer cette capture'
                        : 'Masqué en ligne · gérer les règles'
                      : 'Masquer cette capture dans le partage'}
                  </Button>
                  {current.sharedPrivate && (
                    <span className="privacy-badge">
                      <EyeOff size={14} />{' '}
                      {(current.privacyReasons || ['Masqué dans le partage']).join(' · ')}
                    </span>
                  )}
                  <div className="image-scroll">
                    <div className="image-surface" style={{ width: '100%', height: '100%' }}>
                      {gaps.some((g) => playheadTime >= g.from && playheadTime < g.to) && (
                        <div className="preview-gap">
                          {gaps.find((g) => playheadTime >= g.from && playheadTime < g.to)?.label}
                        </div>
                      )}
                      <img
                        src={imageUrl(current)}
                        alt={`Capture du ${new Date(current.at).toLocaleDateString('fr-FR')} à ${time(current.at)}, ${current.app}`}
                        onLoad={() => {
                          setLoadedImage(current.id);
                          setBrokenImage('');
                        }}
                        onError={() => setBrokenImage(current.id)}
                      />
                    </div>
                  </div>
                  {brokenImage === current.id && (
                    <div className="image-feedback">
                      Cette capture a expiré ou n’est plus disponible.
                    </div>
                  )}
                  {loadedImage !== current.id && brokenImage !== current.id && (
                    <span className="image-loading">Chargement…</span>
                  )}
                  <div className="camera-pip">
                    {current.camera && (
                      <>
                        <img
                          src={`focusmedia://camera/${current.id}`}
                          alt={`Photo caméra à ${time(current.cameraAt || current.at)}`}
                        />
                      </>
                    )}
                  </div>
                </section>
                <div className="transport">
                  <div className="timestamp" title={current.app}>
                    <strong>
                      {time(
                        gaps.some((g) => playheadTime >= g.from && playheadTime < g.to)
                          ? playheadTime
                          : current.at,
                      )}
                    </strong>
                    <span>
                      {index + 1} / {frames.length}
                    </span>
                  </div>
                  <div className="playback">
                    <IconButton
                      icon={SkipBack}
                      label="Capture précédente"
                      disabled={index <= 0}
                      onClick={() => step(-1)}
                    />
                    <Button
                      className="play-button"
                      aria-label={playing ? 'Arrêter la lecture' : 'Lire le replay'}
                      onClick={togglePlay}
                    >
                      {playing ? (
                        <Pause size={20} fill="currentColor" />
                      ) : (
                        <Play size={20} fill="currentColor" />
                      )}
                    </Button>
                    <IconButton
                      icon={SkipForward}
                      label="Capture suivante"
                      disabled={index === frames.length - 1}
                      onClick={() => step(1)}
                    />
                  </div>
                  <label className="inline-slider" title="Vitesse de lecture">
                    <input
                      aria-label="Vitesse de lecture"
                      type="range"
                      min="1"
                      max="8"
                      step="1"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    />
                    <output>{speed} img/s</output>
                  </label>
                </div>
                <Timeline
                  totals={totals}
                  frames={frames}
                  segments={softwareSegments}
                  gaps={gaps}
                  icons={data.appIcons}
                  checkins={checkinEntries}
                  start={start}
                  end={end}
                  cursor={playheadTime}
                  zoom={timelineZoom}
                  setZoom={setTimelineZoom}
                  seek={seek}
                  settings={settings}
                  onPrivacy={(key, value) =>
                    act(() =>
                      api.settings({
                        [key]: settings[key]?.includes(value)
                          ? settings[key].filter((v) => v !== value)
                          : [...(settings[key] || []), value],
                      }),
                    )
                  }
                  onRule={(key, value, category) =>
                    act(() => {
                      const rules = { ...settings[key] };
                      if (category === 'auto') delete rules[value];
                      else rules[value] = category;
                      return api.settings({ [key]: rules });
                    })
                  }
                />
              </>
            )}

            <details className="insights">
              <summary>Logiciels & répartition · {duration(stats.total)} observées</summary>
              {stats.total ? (
                <>
                  <div className="category-summary">
                    {Object.entries(stats.categories)
                      .filter(([, ms]) => ms > 0)
                      .map(([cat, ms]) => (
                        <div key={cat}>
                          <span className={`legend-dot ${cat}`} />
                          <span>{labels[cat]}</span>
                          <strong>{duration(ms)}</strong>
                        </div>
                      ))}
                  </div>
                  <div className="distribution" aria-label="Répartition estimée du temps">
                    {Object.entries(stats.categories)
                      .filter(([, ms]) => ms)
                      .map(([cat, ms]) => (
                        <span
                          key={cat}
                          className={cat}
                          style={{ width: `${(ms / stats.total) * 100}%` }}
                          title={`${labels[cat]} : ${duration(ms)}`}
                        />
                      ))}
                  </div>
                  <div className="app-breakdown">
                    {stats.apps.slice(0, 8).map((a, i) => (
                      <div className="app-stat" key={a.name}>
                        <AppIcon name={a.name} icons={data.appIcons} />
                        <span>{a.name}</span>
                        <div className="app-stat-bar">
                          {Object.entries(a.categories)
                            .filter(([, ms]) => ms)
                            .map(([cat, ms]) => (
                              <span
                                key={cat}
                                className={cat}
                                style={{ width: `${(ms / stats.apps[0].ms) * 100}%` }}
                              />
                            ))}
                        </div>
                        <strong>{duration(a.ms)}</strong>
                        <small className="app-percent">
                          {Math.round((a.ms / stats.total) * 100)} %
                        </small>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </details>
            {frames.length > 0 && (
              <div className="archive-actions">
                <div>
                  <Button className="text-button" onClick={() => setConfirmDelete('frame')}>
                    <Trash2 size={14} /> Supprimer cette capture
                  </Button>
                  {selected?.endedAt && (
                    <Button className="text-button" onClick={() => setConfirmDelete('session')}>
                      Supprimer la session
                    </Button>
                  )}
                </div>
              </div>
            )}
            {confirmDelete && (
              <div className="notice delete-confirm" role="alert">
                <span>
                  Supprimer{' '}
                  {confirmDelete === 'frame' ? 'cette capture' : 'cette session et ses captures'}{' '}
                  définitivement ?
                </span>
                <Button onClick={() => setConfirmDelete(null)}>Garder</Button>
                <Button
                  className="danger"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      if (confirmDelete === 'frame') await api.deleteFrame(current.id);
                      else {
                        await api.deleteSession(selected.id);
                        chooseSession(null);
                      }
                      setConfirmDelete(null);
                    })
                  }
                >
                  Supprimer
                </Button>
              </div>
            )}
          </>
        )}
      </main>
      {data.music && (
        <audio
          ref={audio}

          preload="none"
          onEnded={musicEnded}
          onError={() => musicEnded(true)}
        />
      )}
    </div>
  );
}
