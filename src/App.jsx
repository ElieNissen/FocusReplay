import React, { useEffect, useMemo, useRef, useState } from 'react';
import SettingsView from './SettingsView';
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
    [timelineZoom, setTimelineZoom] = useState(1),
    [imageZoom, setImageZoom] = useState(1);
  const [clock, setClock] = useState(Date.now()),
    [exportOpen, setExportOpen] = useState(false),
    [exportState, setExportState] = useState(null),
    [confirmDelete, setConfirmDelete] = useState(null),
    [loadedImage, setLoadedImage] = useState(''),
    [brokenImage, setBrokenImage] = useState('');
  const [exportScope, setExportScope] = useState('day'),
    [exportHeight, setExportHeight] = useState(1080),
    [exportFps, setExportFps] = useState(4),
    [rangeStart, setRangeStart] = useState(null),
    [rangeEnd, setRangeEnd] = useState(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const audio = useRef(null),
    musicTimer = useRef(null),
    musicSession = useRef(undefined),
    timeline = useRef(null),
    stage = useRef(null),
    latest = useRef({});
  const widget = location.hash === '#widget';
  const cameraStatus = useCamera(data, widget);
  const [includeCamera, setIncludeCamera] = useState(true);
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
        musicSession.current = s.sessions.find((x) => !x.endedAt)?.id || null;
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
      clearInterval(musicTimer.current);
    };
  }, []);
  useEffect(() => {
    if (!api || widget) return;
    return api.onBreakEnded(playChime);
  }, []);
  const active = data?.sessions.find((s) => !s.endedAt);
  const paused = active && (active.status === 'paused' || data.systemPaused);
  const settings = data?.settings;
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
  const stopMusic = () => {
    clearInterval(musicTimer.current);
    audio.current?.pause();
    setMusicPlaying(false);
  };
  const playMusic = () => {
    if (!audio.current || !data?.music) return;
    clearInterval(musicTimer.current);
    audio.current.volume = settings.volume;
    audio.current.currentTime = 0;
    audio.current
      .play()
      .then(() => setMusicPlaying(true))
      .catch(() =>
        setError('Impossible de lire ce MP3. Essayez un autre fichier dans les réglages.'),
      );
    if (settings.musicSeconds)
      musicTimer.current = setInterval(() => {
        const remaining = settings.musicSeconds - audio.current.currentTime;
        audio.current.volume = settings.volume * Math.max(0, Math.min(1, remaining / 3));
        if (remaining <= 0) stopMusic();
      }, 150);
  };
  useEffect(() => {
    if (!data || widget) return;
    if (active && musicSession.current !== undefined && active.id !== musicSession.current) {
      musicSession.current = active.id;
      if (settings.musicEnabled && data.music) playMusic();
    }
    if (!active || paused) stopMusic();
  }, [active?.id, paused]);
  useEffect(() => {
    if (!data?.music || settings?.musicEnabled === false) stopMusic();
  }, [data?.music, settings?.musicEnabled]);
  const sessions = useMemo(
    () =>
      data?.sessions
        .filter(
          (s) =>
            dayKey(s.startedAt) === day ||
            s.frames.some((f) => dayKey(f.at) === day) ||
            s.activity.some((a) => dayKey(a.from) === day),
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
  const end = Math.max(start + 1, frames.at(-1)?.at || 0, ...segments.map((a) => a.to));
  const span = Math.max(end - start, 1),
    playheadTime = follow
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
  latest.current = { frames, index, step, togglePlay, view, exportOpen };
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
        ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'AUDIO'].includes(e.target.tagName) ||
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
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        latest.current.step(-1);
      }
      if (e.key === 'ArrowRight') {
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
    setRangeStart(null);
    setRangeEnd(null);
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
  const filmFrames = frames.filter(
    (_f, i) => i % Math.max(1, Math.floor(frames.length / (12 * timelineZoom))) === 0,
  );
  const statusText = !active
    ? 'Prêt quand vous l’êtes'
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
          <span className="version">01</span>
        </div>
        <p className="brand-caption">Votre journée, en perspective.</p>
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
        <div className="sidebar-label">VOTRE HISTORIQUE</div>
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
          {!sessions.length && (
            <p className="sidebar-empty">Les sessions de cette journée apparaîtront ici.</p>
          )}
        </nav>
        <footer className="sidebar-footer">
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
            <ShieldCheck size={15} />
            <span>Sur ce PC uniquement</span>
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
        {data.cameraWarning && settings.cameraEnabled && active && (
          <div className="notice" role="status">
            <CameraOff size={17} />
            <span>{data.cameraWarning}</span>
          </div>
        )}
        {view === 'rewards' ? (
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
            playMusic={playMusic}
            stopMusic={stopMusic}
            musicPlaying={musicPlaying}
          />
        ) : (
          <>
            <div className="page-heading">
              <div>
                <div className="eyebrow">REVOIR, COMPRENDRE, RECOMMENCER</div>
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
                <p>
                  {frames.length
                    ? `${frames.length} capture${frames.length === 1 ? '' : 's'} · Glissez dans la frise pour remonter le temps.`
                    : 'Un clic pour commencer. Rien à remplir.'}
                </p>
              </div>
              <button
                disabled={!frames.length}
                onClick={() => {
                  setExportOpen((p) => !p);
                  setExportScope(selectedSession ? 'session' : 'day');
                }}
              >
                <Download size={17} /> Exporter en MP4
              </button>
            </div>
            {exportOpen && (
              <section className="export-panel" aria-label="Options d’export">
                <div className="section-title">
                  <h2>Garder une trace</h2>
                  <IconButton
                    icon={X}
                    label="Fermer l’export"
                    onClick={() => setExportOpen(false)}
                  />
                </div>
                <div className="export-fields">
                  <label>
                    Contenu
                    <select value={exportScope} onChange={(e) => setExportScope(e.target.value)}>
                      <option value="day">Toute la journée</option>
                      {selectedSession && <option value="session">Cette session</option>}
                      <option value="range" disabled={!rangeStart || !rangeEnd}>
                        Plage marquée dans la frise
                      </option>
                    </select>
                  </label>
                  <label>
                    Défilement
                    <select
                      value={exportFps}
                      onChange={(e) => setExportFps(Number(e.target.value))}
                    >
                      {[1, 2, 4, 8].map((n) => (
                        <option key={n} value={n}>
                          {n} images / seconde
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Résolution
                    <select
                      value={exportHeight}
                      onChange={(e) => setExportHeight(Number(e.target.value))}
                    >
                      <option value={1080}>1080p</option>
                      <option value={720}>720p · plus léger</option>
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={exportState?.status === 'running' || busy}
                    onClick={() =>
                      act(() =>
                        api.export({
                          day,
                          sessionId:
                            exportScope === 'session' ||
                            (exportScope === 'range' && selectedSession)
                              ? selectedSession
                              : undefined,
                          from:
                            exportScope === 'range' ? Math.min(rangeStart, rangeEnd) : undefined,
                          to: exportScope === 'range' ? Math.max(rangeStart, rangeEnd) : undefined,
                          fps: exportFps,
                          height: exportHeight,
                          includeCamera,
                        }),
                      )
                    }
                  >
                    <Download size={16} /> Créer le MP4
                  </button>
                </div>
                <label className="export-camera-toggle">
                  <input
                    type="checkbox"
                    checked={includeCamera}
                    onChange={(e) => setIncludeCamera(e.target.checked)}
                  />{' '}
                  Inclure les photos caméra disponibles, en incrustation
                </label>
                <p className="hint">
                  Captures et heures exactes, sans audio. Le MP4 reste dans le dossier choisi, même
                  après le nettoyage des captures.
                </p>
              </section>
            )}
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
                <h2>
                  {active && (!selectedSession || selectedSession === active.id)
                    ? 'La session a commencé.'
                    : 'À quoi ressemble votre temps ?'}
                </h2>
                <p>
                  {active && (!selectedSession || selectedSession === active.id)
                    ? 'Les captures apparaissent ici automatiquement. Vous pouvez continuer à travailler.'
                    : 'Lancez une session, puis travaillez comme d’habitude. Retrouvez les captures et les logiciels utilisés au même endroit.'}
                </p>
                {!active && (
                  <button className="primary large" onClick={begin} disabled={busy}>
                    <Play size={17} fill="currentColor" /> Commencer
                  </button>
                )}
                <div className="empty-notes">
                  <span>
                    <Monitor size={16} /> Une capture toutes les {settings.interval} s
                  </span>
                  <span>
                    <ShieldCheck size={16} /> Conservation : {settings.retentionDays} jours
                  </span>
                </div>
                <p className="hint">
                  Le suivi est visible dans la barre Windows. Pause et arrêt sont toujours
                  accessibles.
                </p>
              </section>
            ) : (
              <>
                <section
                  className="replay-stage"
                  ref={stage}
                  aria-label="Prévisualisation de la capture"
                >
                  <div className="stage-top">
                    <span className={`category-pill ${current?.category || 'unknown'}`}>
                      <span />
                      {labels[current?.category] || labels.unknown}
                    </span>
                    <div>
                      <IconButton
                        icon={imageZoom === 1 ? ZoomIn : RotateCcw}
                        label={imageZoom === 1 ? 'Agrandir la capture' : 'Ajuster la capture'}
                        onClick={() => setImageZoom((z) => (z === 1 ? 2 : 1))}
                      />
                      <IconButton
                        icon={Maximize}
                        label="Plein écran"
                        onClick={() =>
                          document.fullscreenElement
                            ? document.exitFullscreen()
                            : stage.current.requestFullscreen()
                        }
                      />
                    </div>
                  </div>
                  <div className="image-scroll">
                    <div
                      className="image-surface"
                      style={{ width: `${imageZoom * 100}%`, height: `${imageZoom * 100}%` }}
                    >
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
                        <span>
                          <Camera size={12} /> {time(current.cameraAt || current.at)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="stage-caption">
                    <span>
                      <Monitor size={14} />
                      {current.app}
                    </span>
                    <span>
                      {current.display} · {current.width} × {current.height}
                    </span>
                  </div>
                </section>
                <div className="transport">
                  <div className="timestamp">
                    <strong>{time(current.at)}</strong>
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
                    <select
                      aria-label="Vitesse de lecture"
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    >
                      {[1, 2, 4, 8].map((n) => (
                        <option value={n} key={n}>
                          {n} img/s
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    className={follow ? 'selected' : ''}
                    onClick={() => {
                      setFollow(true);
                      setPlaying(false);
                    }}
                  >
                    <Radio size={15} /> Dernière capture
                  </button>
                </div>
                <section className="timeline-section" aria-label="Timeline interactive">
                  <div className="timeline-toolbar">
                    <span className="eyebrow">LE FIL DE VOTRE SESSION</span>
                    <div className="timeline-tools">
                      <label>
                        Zoom{' '}
                        <select
                          aria-label="Zoom de la timeline"
                          value={timelineZoom}
                          onChange={(e) => setTimelineZoom(Number(e.target.value))}
                        >
                          {[1, 2, 4, 8].map((z) => (
                            <option key={z} value={z}>
                              {z}×
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className={rangeStart ? 'selected' : ''}
                        onClick={() => setRangeStart(current.at)}
                        title="Marquer le début de l’export"
                      >
                        Début{rangeStart ? ` ${shortTime(rangeStart)}` : ''}
                      </button>
                      <button
                        className={rangeEnd ? 'selected' : ''}
                        onClick={() => setRangeEnd(current.at)}
                        title="Marquer la fin de l’export"
                      >
                        Fin{rangeEnd ? ` ${shortTime(rangeEnd)}` : ''}
                      </button>
                    </div>
                  </div>
                  <div className="timeline-scroll" ref={timeline}>
                    <div className="timeline-inner" style={{ width: `${timelineZoom * 100}%` }}>
                      <div className="ruler">
                        {Array.from({ length: 7 }, (_, i) => (
                          <span key={i}>{shortTime(start + (span * i) / 6)}</span>
                        ))}
                      </div>
                      <div className="filmstrip">
                        {filmFrames.map((f) => (
                          <img
                            key={f.id}
                            src={imageUrl(f)}
                            alt=""
                            loading="lazy"
                            draggable="false"
                            style={{ left: `${((f.at - start) / span) * 100}%` }}
                          />
                        ))}
                      </div>
                      <div className="activity-track" aria-hidden="true">
                        {segments.map((a, i) => (
                          <span
                            key={i}
                            className={a.category || 'unknown'}
                            style={{
                              left: `${Math.max(0, ((a.from - start) / span) * 100)}%`,
                              width: `${Math.max(0.1, ((Math.min(a.to, end) - Math.max(a.from, start)) / span) * 100)}%`,
                            }}
                            title={`${a.app} · ${labels[a.category] || labels.unknown}`}
                          />
                        ))}
                      </div>
                      {frames.map((f, i) =>
                        i && f.at - frames[i - 1].at > (frames[i - 1].interval || 60) * 1800 ? (
                          <div
                            key={f.id}
                            className="gap-mark"
                            style={{
                              left: `${((frames[i - 1].at - start) / span) * 100}%`,
                              width: `${((f.at - frames[i - 1].at) / span) * 100}%`,
                            }}
                            title="Interruption ou intervalle sans capture"
                          />
                        ) : null,
                      )}
                      {rangeStart && rangeEnd && (
                        <div
                          className="range-highlight"
                          style={{
                            left: `${((Math.min(rangeStart, rangeEnd) - start) / span) * 100}%`,
                            width: `${(Math.abs(rangeEnd - rangeStart) / span) * 100}%`,
                          }}
                        />
                      )}
                      <div
                        className="software-lane"
                        aria-label="Logiciels utilisés sur la timeline"
                      >
                        {softwareSegments
                          .filter((a) => a.to >= start && a.from <= end)
                          .map((a, i) => (
                            <button
                              key={i}
                              className={`software-segment ${a.category || 'unknown'}`}
                              style={{
                                left: `${Math.max(0, ((a.from - start) / span) * 100)}%`,
                                width: `${Math.max(0.2, ((Math.min(a.to, end) - Math.max(a.from, start)) / span) * 100)}%`,
                              }}
                              title={`${a.app} · ${shortTime(a.from)}–${shortTime(a.to)} · ${duration(a.ms)}`}
                              aria-label={`${a.app} · ${shortTime(a.from)} · ${duration(a.ms)}`}
                              onClick={() => seek(Math.max(start, a.from))}
                            >
                              <span>{a.app}</span>
                            </button>
                          ))}
                      </div>
                      <div
                        className="playhead"
                        style={{ left: `${((playheadTime - start) / span) * 100}%` }}
                      >
                        <span />
                      </div>
                      <input
                        className="scrubber"
                        aria-label="Curseur de la timeline"
                        type="range"
                        min={start}
                        max={end}
                        step="1"
                        value={
                          cursor === null || follow
                            ? current.at
                            : Math.max(start, Math.min(end, cursor))
                        }
                        onChange={(e) => seek(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="timeline-foot">
                    <span>
                      <span className="key">←</span> <span className="key">→</span> Image par image{' '}
                      <span className="key">Espace</span> Lecture
                    </span>
                    <span>Instants capturés, pas un enregistrement continu.</span>
                  </div>
                </section>
              </>
            )}
            <section className="insights">
              <div className="section-title">
                <div>
                  <h2>Où est passé le temps ?</h2>
                  <p>
                    {stats.total ? `${duration(stats.total)} observées · ` : ''}Logiciel au premier
                    plan, relevé toutes les 2 secondes.
                  </p>
                </div>
                <Activity size={20} />
              </div>
              {stats.total ? (
                <>
                  <div className="category-summary">
                    {Object.entries(stats.categories).map(([cat, ms]) => (
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
                        <span className="app-rank">{String(i + 1).padStart(2, '0')}</span>
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
              ) : (
                <p className="insight-empty">
                  {active && !data.trackingAvailable
                    ? 'Le suivi des logiciels démarre ou n’est pas disponible. Les captures restent indépendantes.'
                    : 'La répartition se construit pendant vos sessions, sans rien saisir.'}
                </p>
              )}
              <p className="hint">
                Le classement utilise des indices locaux, sans IA ni envoi de données. Un loisir
                peut servir au travail ; les cas ambigus restent indéterminés. Aucun titre de
                fenêtre n’est conservé.
              </p>
            </section>
            {frames.length > 0 && (
              <div className="archive-actions">
                <span>
                  {(data.bytes / 1024 / 1024).toFixed(1)} Mo conservés · suppression après{' '}
                  {settings.retentionDays} jours
                </span>
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
        <audio ref={audio} src="focusmedia://music/track" preload="auto" onEnded={stopMusic} />
      )}
    </div>
  );
}
