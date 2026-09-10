import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  Monitor,
  Camera,
  Music2,
  Pause,
  Play,
  Trash2,
  Eye,
  Sun,
  ShieldCheck,
  FolderOpen,
} from 'lucide-react';
import { Toggle } from './Toggle';
import MusicSettings from './MusicSettings';
const api = window.focusReplay;
export default function SettingsView({ settings, data, busy, act, onBack, musicStatus }) {
  const [screens, setScreens] = useState([]),
    [cameraConsentOpen, setCameraConsentOpen] = useState(false);
  useEffect(() => {
    api
      .screens()
      .then(setScreens)
      .catch(() => {});
  }, []);
  const save = (key, value) => act(() => api.settings({ [key]: value }));
  const select = (key, label, options, hint) => (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
      </span>
      <select
        value={settings[key]}
        disabled={busy}
        onChange={(e) =>
          save(key, typeof options[0][0] === 'number' ? Number(e.target.value) : e.target.value)
        }
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const toggle = (key, label, hint) => (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
      </span>
      <Toggle
        className="toggle"
        type="checkbox"
        checked={settings[key]}
        disabled={busy}
        onChange={(e) => save(key, e.target.checked)}
      />
    </label>
  );
  return (
    <div className="settings-page">
      <button className="text-button" onClick={onBack}>
        <ChevronLeft size={17} /> Retour au replay
      </button>
      <div className="page-heading">
        <div>
          <h1>Réglages</h1>
        </div>
      </div>
      <section className="settings-section">
        <h2>
          <Monitor size={19} /> Capture & conservation
        </h2>
        {select(
          'interval',
          'Une capture toutes les…',
          [
            [10, '10 secondes'],
            [30, '30 secondes'],
            [60, '1 minute'],
            [120, '2 minutes'],
            [300, '5 minutes'],
            [600, '10 minutes'],
          ],
          'Les changements courts entre deux captures peuvent ne pas apparaître.',
        )}
        {select(
          'displayId',
          'Écran à capturer',
          [['', 'Écran principal'], ...screens.map((s) => [s.id, s.name])],
          'Un écran par session de capture. Choisissez celui sur lequel vous travaillez.',
        )}
        {select('width', 'Résolution maximale', [
          [1280, '1280 px · léger'],
          [1920, '1920 px · équilibré'],
          [2560, '2560 px · plus lisible'],
        ])}
        {select(
          'retentionDays',
          'Conserver les captures',
          [
            [1, '1 jour'],
            [3, '3 jours'],
            [7, '7 jours'],
            [14, '14 jours'],
            [30, '30 jours'],
            [90, '90 jours'],
            [180, '180 jours'],
            [365, '1 an'],
          ],
          'Les plus anciennes sont supprimées automatiquement, avec leur historique associé.',
        )}
        {select(
          'maxMB',
          'Plafond des captures',
          [
            [256, '256 Mo'],
            [512, '512 Mo'],
            [1024, '1 Go'],
            [2048, '2 Go'],
            [5120, '5 Go'],
          ],
          'Si le plafond est atteint, les captures les plus anciennes partent en premier.',
        )}
      </section>
      <section className="settings-section">
        <h2>
          <Camera size={19} /> Caméra
        </h2>
        <label className="setting-row">
          <span>
            <strong>Ajouter une photo caméra aux captures</strong>
          </span>
          <input
            aria-label="Ajouter une photo caméra aux captures"
            className="toggle"
            type="checkbox"
            checked={settings.cameraEnabled}
            onChange={(e) =>
              e.target.checked
                ? setCameraConsentOpen(true)
                : act(() => api.settings({ cameraEnabled: false }))
            }
          />
        </label>
        {cameraConsentOpen && !settings.cameraEnabled && (
          <div className="camera-consent">
            <strong>Autoriser les photos de votre caméra ?</strong>
            <p>
              La caméra prendra une photo à chaque capture d’écran. Elle reste ouverte pendant la
              session, s’arrête en pause et peut apparaître dans les exports.
            </p>
            <div>
              <button onClick={() => setCameraConsentOpen(false)}>Pas maintenant</button>
              <button
                className="primary"
                onClick={() =>
                  act(async () => {
                    await api.allowCamera();
                    setCameraConsentOpen(false);
                  })
                }
              >
                Autoriser les photos caméra
              </button>
            </div>
          </div>
        )}
      </section>
      <MusicSettings data={data} settings={settings} act={act} busy={busy} status={musicStatus} />
      <section className="settings-section">
        <h2>
          <Music2 size={19} /> Sons
        </h2>
        {toggle('soundEnabled', 'Sons de l’interface')}
        <label className="setting-row">
          <strong>Volume des sons</strong>
          <input
            aria-label="Volume des sons"
            type="range"
            min="0"
            max="1"
            step="0.05"
            disabled={!settings.soundEnabled || busy}
            value={settings.soundVolume}
            onChange={(e) => save('soundVolume', Number(e.target.value))}
          />
        </label>
      </section>
      <section className="settings-section">
        <h2>
          <Eye size={19} /> Suivi
        </h2>
        {toggle('browserDomains', 'Reconnaître les sites (domaine uniquement)')}
        {toggle(
          'browserHints',
          'Reconnaître les usages du navigateur',
          'Des mots connus dans le titre aident le classement. Le titre est traité en mémoire, puis oublié.',
        )}
        {toggle(
          'distractionReminder',
          'Signaler un détour probable',
          'Après une minute sur un loisir probable, au maximum un rappel toutes les 10 minutes.',
        )}
        {toggle('driftPromptEnabled', 'Demander pourquoi je quitte le travail')}
        {select('reminderMinutes', 'Sur quoi tu travailles ?', [
          [0, 'Désactivé'],
          [15, 'Toutes les 15 minutes'],
          [30, 'Toutes les 30 minutes'],
          [60, 'Toutes les heures'],
        ])}
        <button
          disabled={busy || !data.sessions.some((s) => !s.endedAt && s.status === 'recording')}
          onClick={() => act(() => api.checkinPreview())}
        >
          Essayer le rappel
        </button>
        {toggle(
          'widget',
          'Afficher la mini-barre flottante',
          'Une présence discrète, déplaçable, avec la durée et le bouton Pause.',
        )}
      </section>
      <details className="classification-settings">
        <summary>Classement des logiciels</summary>
        {[...new Set(data.sessions.flatMap((s) => s.activity.map((a) => a.app)))]
          .filter((name) => !name.startsWith('Inactivité'))
          .sort()
          .map((name) => (
            <label className="setting-row" key={name}>
              <span>{name}</span>
              <select
                aria-label={'Classement de ' + name}
                value={settings.appRules?.[name.toLowerCase()] || 'auto'}
                onChange={(e) => {
                  const rules = { ...settings.appRules };
                  if (e.target.value === 'auto') delete rules[name.toLowerCase()];
                  else rules[name.toLowerCase()] = e.target.value;
                  save('appRules', rules);
                }}
              >
                <option value="auto">Automatique</option>
                <option value="work">Travail</option>
                <option value="distraction">Loisir</option>
                <option value="unknown">Indéterminé</option>
              </select>
            </label>
          ))}
      </details>
      <section className="settings-section">
        <h2>
          <Sun size={19} /> Apparence
        </h2>
        {select('theme', 'Thème de l’interface', [
          ['dark', 'Sombre'],
          ['light', 'Clair'],
          ['system', 'Suivre Windows'],
        ])}
      </section>
      <button onClick={() => api.openData()}>
        <FolderOpen size={16} />
        Ouvrir les fichiers
      </button>
    </div>
  );
}
