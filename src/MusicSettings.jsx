import React, { useEffect, useState } from 'react';
import { Music2, Play, Square } from 'lucide-react';
import { Toggle } from './Toggle';
const api = window.focusReplay;
const names = {
  launch: 'À l’ouverture de l’application',
  intro: 'Au début de la session',
  session: 'Pendant la session',
};
function Slot({ phase, slot, save, busy }) {
  const [draft, setDraft] = useState(slot),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft(slot);
    setDirty(false);
  }, [JSON.stringify(slot)]);
  const update = (patch) => {
    setDraft({ ...draft, ...patch });
    setDirty(true);
  };
  return (
    <div className="music-slot">
      <label className="setting-row">
        <strong>{names[phase]}</strong>
        <Toggle
          className="toggle"
          checked={slot.enabled}
          disabled={busy}
          onChange={(e) => save({ ...slot, enabled: e.target.checked })}
        />
      </label>
      {slot.enabled && (
        <div className="music-slot-options">
          <div className="music-options-row">
            <select
              aria-label={'Source · ' + names[phase]}
              value={draft.source}
              onChange={(e) => update({ source: e.target.value })}
            >
              <option value="local">MP3 local</option>
              <option value="spotify">Spotify</option>
            </select>
            {draft.source === 'spotify' && (
              <select
                aria-label={'Choix · ' + names[phase]}
                value={draft.mode}
                onChange={(e) => update({ mode: e.target.value, links: '' })}
              >
                <option value="track">Un titre</option>
                <option value="selection">Plusieurs titres · aléatoire</option>
                <option value="playlist">Une playlist</option>
              </select>
            )}
            {!dirty && (
              <button
                aria-label={'Écouter · ' + names[phase]}
                disabled={busy}
                onClick={() => api.musicPreview(phase)}
              >
                <Play size={15} />
                Écouter
              </button>
            )}
          </div>
          {draft.source === 'spotify' && (
            <textarea
              aria-label={'Liens Spotify · ' + names[phase]}
              rows={draft.mode === 'selection' ? 3 : 1}
              value={draft.links}
              onChange={(e) => update({ links: e.target.value })}
              placeholder={
                draft.mode === 'selection'
                  ? 'Un lien de titre Spotify par ligne'
                  : draft.mode === 'playlist'
                    ? 'Coller le lien de la playlist Spotify'
                    : 'Coller le lien du titre Spotify'
              }
            />
          )}
          {dirty && (
            <button
              className="primary"
              disabled={busy || (draft.source === 'spotify' && !draft.links.trim())}
              onClick={() => save(draft)}
            >
              Enregistrer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export default function MusicSettings({ settings, act, busy, status }) {
  const [clientId, setClient] = useState(''),
    [connecting, setConnecting] = useState(false),
    [devices, setDevices] = useState([]);
  const refresh = () => act(async () => setDevices(await api.spotifyDevices()));
  useEffect(() => {
    if (status?.spotify?.connected)
      api
        .spotifyDevices()
        .then(setDevices)
        .catch(() => {});
  }, [status?.spotify?.connected]);
  const connect = async () => {
    setConnecting(true);
    await act(() => api.spotifyConnect(clientId));
    setConnecting(false);
  };
  return (
    <section className="settings-section">
      <h2>
        <Music2 size={19} />
        Musique
      </h2>
      <div className="setting-row">
        <span>Spotify {status?.spotify?.connected ? 'connecté' : '· Premium requis'}</span>
        {status?.playing && (
          <button onClick={() => api.musicStop()}>
            <Square size={15} />
            Arrêter
          </button>
        )}
      </div>
      <details className="spotify-setup" open={connecting || undefined}>
        <summary>
          {status?.spotify?.connected ? 'Compte et appareil Spotify' : 'Connecter Spotify'}
        </summary>
        {status?.spotify?.connected ? (
          <>
            <div className="music-options-row">
              <select
                aria-label="Appareil Spotify"
                value={settings.spotifyDevice}
                onChange={(e) => act(() => api.settings({ spotifyDevice: e.target.value }))}
              >
                <option value="">Choisir l’appareil de lecture</option>
                {settings.spotifyDevice &&
                  !devices.some((d) => d.id === settings.spotifyDevice) && (
                    <option value={settings.spotifyDevice}>Appareil indisponible</option>
                  )}
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · {d.type}
                  </option>
                ))}
              </select>
              <button disabled={busy} onClick={refresh}>
                Actualiser
              </button>
              <button disabled={busy} onClick={() => act(() => api.spotifyDisconnect())}>
                Déconnecter
              </button>
            </div>
            {!devices.length && (
              <p>Ouvrez Spotify et lancez un titre pour rendre votre PC disponible.</p>
            )}
          </>
        ) : (
          <>
            <p>
              Une seule fois : créez une application dans Spotify Developers, puis ajoutez cette
              adresse de redirection :
            </p>
            <code>{status?.spotify?.redirect || 'http://127.0.0.1:43827/callback'}</code>
            <div className="music-options-row">
              <button onClick={() => api.spotifySetup()}>Ouvrir Spotify Developers</button>
              <input
                aria-label="Spotify Client ID"
                placeholder="Client ID"
                value={clientId}
                onChange={(e) => setClient(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              <button disabled={busy || !clientId.trim()} onClick={connect}>
                {connecting ? 'Connexion…' : 'Se connecter'}
              </button>
              {connecting && <button onClick={() => api.spotifyDisconnect()}>Annuler</button>}
            </div>
          </>
        )}
      </details>
      {status?.error && (
        <p role="alert" className="music-error">
          {status.error}
        </p>
      )}
      {Object.entries(names).map(([phase]) => (
        <Slot
          key={phase}
          phase={phase}
          slot={settings.musicSlots[phase]}
          busy={busy}
          save={(slot) =>
            act(() => api.settings({ musicSlots: { ...settings.musicSlots, [phase]: slot } }))
          }
        />
      ))}
      <small>
        Une seule lecture. Les titres saisis sont mélangés ; la musique de session suit celle du
        début.
      </small>
    </section>
  );
}
