import React, { useEffect, useMemo, useRef, useState } from 'react';
import Profile from './Profile';
import SettingsView from './SettingsView';
import Timeline from './Timeline';
import AppIcon from './AppIcon';
import { sessionGaps } from './activity-overview.mjs';
import { CheckinHistory } from './CheckinOverlay';
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
    <button className="icon-button" aria-label={label} title={label} {...props}>
      <Icon size={18} />
    </button>
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
  const start = frames.length ? Math.min(frames[0].at, segments[0]?.from ?? frames[0].at) : 0;
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
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
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
  if (widget)
    return (
      <div className="widget">
        <div className="widget-drag">
          <CircleDot size={18} />
          <div>
            <strong>FocusReplay</strong>
            <small>
              {active
                ? `${paused ? 'En pause' : 'Capture active'} · ${duration(clock - active.startedAt)}`
                : 'Session terminée'}
            </small>
          </div>
        </div>
        <IconButton
          icon={paused ? Play : Pause}
          label={paused ? 'Reprendre' : 'Pause'}
          onClick={() => act(() => api.pause())}
        />
        <IconButton icon={Maximize} label="Ouvrir FocusReplay" onClick={() => api.showMain()} />
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
        <button
          className="start-button"
          onClick={
            active
              ? () => {
                  changeDay(dayKey(active.startedAt));
                  chooseSession(active.id);
                }
              : begin
          }
          disabled={busy}
        >
          {active ? <Radio size={17} /> : <Play size={17} fill="currentColor" />}
          {active ? 'Session en cours' : 'Commencer une session'}
        </button>
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
        <button
          className={`day-button ${!selectedSession && view === 'replay' ? 'selected' : ''}`}
          onClick={() => chooseSession(null)}
        >
          <span>
            <Film size={17} /> Toute la journée
          </span>
          <small>
            {sessions.reduce((n, s) => n + s.frames.filter((f) => dayKey(f.at) === day).length, 0)}
          </small>
        </button>
        <nav className="session-list" aria-label="Sessions">
          {sessions.map((s) => (
            <button
              key={s.id}
              className={`session-row ${selectedSession === s.id && view === 'replay' ? 'selected' : ''}`}
              onClick={() => chooseSession(s.id)}
            >
              <div>
                <span>{sessionName(s)}</span>
                {!s.endedAt && <span className={`record-dot ${paused ? 'is-paused' : ''}`} />}
              </div>
              <small>
                {shortTime(s.startedAt)} ·{' '}
                {s.endedAt ? duration(s.endedAt - s.startedAt) : 'En cours'} · {s.frames.length}{' '}
                {s.frames.length === 1 ? 'image' : 'images'}
              </small>
              {s.status === 'interrupted' && <small>Interrompue, captures récupérées</small>}
            </button>
          ))}
          {!sessions.length && <span />}
        </nav>
        <footer className="sidebar-footer">
          <button
            className={view === 'profile' ? 'selected' : ''}
            onClick={() => {
              setView('profile');
              setPlaying(false);
            }}
          >
            <Activity size={17} /> Profil
          </button>
          <button
            className={view === 'rewards' ? 'selected' : ''}
            onClick={() => {
              setView('rewards');
              setPlaying(false);
            }}
          >
            <Gift size={17} /> Pauses & récompenses
          </button>
          <button
            className={view === 'settings' ? 'selected' : ''}
            onClick={() => {
              setView('settings');
              setPlaying(false);
            }}
          >
            <Settings size={17} /> Réglages
          </button>
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
      <main className="main-content">
        <header className="session-bar">
          <div className="status">
            <span className={`record-dot ${!active || paused ? 'is-paused' : ''}`} />
            <span>{statusText}</span>
            {active && <strong className="tabular">{duration(clock - active.startedAt)}</strong>}
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
              <button onClick={stopMusic}>
                <Volume2 size={16} /> Couper la musique
              </button>
            )}
            {active && (
              <>
                <button
                  disabled={busy || data.systemPaused}
                  onClick={() => (paused ? act(() => api.pause()) : setPauseMenu((p) => !p))}
                >
                  {paused ? <Play size={16} /> : <Pause size={16} />}{' '}
                  {paused ? 'Reprendre' : 'Pause'}
                </button>
                <button
                  className="stop-button"
                  disabled={busy}
                  onClick={() => act(() => api.stop())}
                >
                  <Square size={13} fill="currentColor" /> Terminer
                </button>
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
                {[2, 5, 10, 15].map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() =>
                      act(async () => {
                        await api.pauseFor(minutes);
                        setPauseMenu(false);
                      })
                    }
                  >
                    {minutes} min
                  </button>
                ))}
                <button
                  onClick={() =>
                    act(async () => {
                      await api.pauseFor(null);
                      setPauseMenu(false);
                    })
                  }
                >
                  Sans limite
                </button>
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
                <button type="submit">Commencer cette pause</button>
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
        <BreakBanner wallet={data.wallet} pauseTimer={data.pauseTimer} clock={clock} act={act} />
        {musicStatus.error && view !== 'settings' && (
          <div className="notice" role="status">
            <Music2 size={17} />
            <span>{musicStatus.error}</span>
            <button onClick={() => setView('settings')}>Musique</button>
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
              <button
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
              </button>
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
                    <button onClick={() => api.cancelExport()}>Annuler</button>
                  </>
                ) : exportState.status === 'done' ? (
                  <>
                    <Check size={18} />
                    <span>Vidéo prête : {exportState.name}</span>
                    <button onClick={() => api.openExport()}>
                      <FolderOpen size={16} /> Voir le fichier
                    </button>
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
                  <button className="primary large" onClick={begin} disabled={busy}>
                    <Play size={17} fill="currentColor" /> Commencer
                  </button>
                )}
              </section>
            ) : (
              <>
                <section className="replay-stage" aria-label="Prévisualisation de la capture">
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
                    <button
                      className="play-button"
                      aria-label={playing ? 'Arrêter la lecture' : 'Lire le replay'}
                      onClick={togglePlay}
                    >
                      {playing ? (
                        <Pause size={20} fill="currentColor" />
                      ) : (
                        <Play size={20} fill="currentColor" />
                      )}
                    </button>
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
                <button
                  className="text-button"
                  disabled={busy || current.private}
                  onClick={() => act(() => api.shareMask(current.id))}
                >
                  {current.private ? 'Capture privée' : 'Masquer cette capture dans le partage'}
                </button>
                <Timeline
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
            <CheckinHistory entries={checkinEntries} seek={seek} />
            <section className="insights">
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
            </section>
            {frames.length > 0 && (
              <div className="archive-actions">
                <div>
                  <button className="text-button" onClick={() => setConfirmDelete('frame')}>
                    <Trash2 size={14} /> Supprimer cette capture
                  </button>
                  {selected?.endedAt && (
                    <button className="text-button" onClick={() => setConfirmDelete('session')}>
                      Supprimer la session
                    </button>
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
                <button onClick={() => setConfirmDelete(null)}>Garder</button>
                <button
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
                </button>
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
