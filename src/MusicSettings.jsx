import React, { useEffect, useRef, useState } from 'react';
import { Music2, Play, Square, Plus, X, Search, ExternalLink } from 'lucide-react';
import { Toggle } from './Toggle';
const api = window.focusReplay;
const names = {
  launch: 'À l’ouverture',
  intro: 'Au début de la session',
  session: 'Pendant la session',
};
function TrackRow({ item, action, label, disabled }) {
  return (
    <div className="track-row">
      {item.image ? (
        <img src={item.image} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className="track-art">
          <Music2 size={18} />
        </span>
      )}
      <div className="track-name">
        <strong>{item.name}</strong>
        <small>{item.subtitle}</small>
      </div>
      <button
        className="icon-button"
        title="Ouvrir dans Spotify"
        aria-label={'Ouvrir dans Spotify · ' + item.name}
        onClick={() => api.spotifyOpen(item.uri)}
      >
        <ExternalLink size={14} />
      </button>
      <button
        className="icon-button"
        aria-label={label + ' · ' + item.name}
        title={label}
        disabled={disabled}
        onClick={action}
      >
        {label === 'Retirer' ? <X size={16} /> : <Plus size={16} />}
      </button>
    </div>
  );
}
function Picker({ mode, items, choose, connected, phase }) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [more, setMore] = useState(false);
  const generation = useRef(0),
    page = useRef(0);
  const load = async (offset = 0, version = ++generation.current) => {
    setLoading(true);
    setError('');
    try {
      const result =
        mode === 'playlist'
          ? await api.spotifyPlaylists(offset)
          : await api.spotifySearch(query, offset);
      if (version !== generation.current) return;
      setResults((old) => (offset ? [...old, ...result.items] : result.items));
      setMore(result.more);
      page.current = offset;
    } catch (e) {
      if (version === generation.current) setError(e.message.replace(/^.*Error: /, ''));
    } finally {
      if (version === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    const version = ++generation.current;
    setResults([]);
    setMore(false);
    setError('');
    setLoading(false);
    if (!connected || (mode !== 'playlist' && query.trim().length < 2)) return;
    const timer = setTimeout(() => load(0, version), mode === 'playlist' ? 0 : 350);
    return () => {
      clearTimeout(timer);
      ++generation.current;
    };
  }, [query, mode, connected]);
  return (
    <div className="music-picker">
      {mode === 'playlist' ? (
        <div className="picker-heading">
          Mes playlists{' '}
          <button disabled={!connected || loading} onClick={() => load()}>
            Actualiser
          </button>
        </div>
      ) : (
        <label className="music-search">
          <Search size={17} />
          <input
            aria-label={'Rechercher un titre · ' + names[phase]}
            placeholder="Rechercher un titre ou un artiste"
            value={query}
            disabled={!connected}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      )}
      {!connected && <small>Connectez Spotify pour rechercher et retrouver vos playlists.</small>}
      {error && <p role="alert">{error}</p>}
      <div className="search-results" aria-label="Résultats Spotify" aria-busy={loading}>
        {results.map((item) => (
          <TrackRow
            key={item.uri}
            item={item}
            label="Ajouter"
            action={() => choose(item)}
            disabled={items.some((i) => i.uri === item.uri)}
          />
        ))}
        {loading && <small role="status">Chargement…</small>}
        {!loading &&
          !error &&
          connected &&
          !results.length &&
          (mode === 'playlist' || query.trim().length >= 2) && <small>Aucun résultat.</small>}
      </div>
      {more && (
        <button
          disabled={loading}
          onClick={() => load(page.current + (mode === 'playlist' ? 50 : 10))}
        >
          Afficher plus
        </button>
      )}
      <details>
        <summary>Ajouter avec un lien Spotify</summary>
        <form
          className="music-options-row"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const value = new FormData(form).get('link');
            try {
              const item = await api.spotifyResolve(
                value,
                mode === 'playlist' ? 'playlist' : 'track',
              );
              choose(item);
              form.reset();
            } catch (e) {
              setError(e.message.replace(/^.*Error: /, ''));
            }
          }}
        >
          <input
            name="link"
            aria-label={'Lien Spotify · ' + names[phase]}
            placeholder="Lien Spotify"
            required
          />
          <button disabled={!connected}>Ajouter</button>
        </form>
      </details>
    </div>
  );
}
function Slot({ phase, slot, save, busy, audio, connected, status, act }) {
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
  const items = draft.items?.length
    ? draft.items
    : draft.links
        .split(/\s+/)
        .filter(Boolean)
        .map((uri) => ({
          uri: uri.startsWith('spotify:')
            ? uri
            : 'spotify:' + uri.split('/').slice(-2).join(':').split('?')[0],
          name: 'Titre importé',
          subtitle: '',
          image: '',
        }));
  const setItems = (next) => update({ items: next, links: next.map((i) => i.uri).join('\n') });
  const choose = (item) =>
    setItems(
      draft.mode === 'selection'
        ? [...items.filter((i) => i.uri !== item.uri), item].slice(0, 100)
        : [item],
    );
  const playing = status?.playing && status.phase === phase;
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
            <div className="choice-buttons" role="group" aria-label={'Source · ' + names[phase]}>
              {['local', 'spotify'].map((source) => (
                <button
                  key={source}
                  aria-pressed={draft.source === source}
                  onClick={() => update({ source })}
                >
                  {source === 'local' ? 'MP3' : 'Spotify'}
                </button>
              ))}
            </div>
            <button
              disabled={busy || dirty || (draft.source === 'local' ? !audio : !items.length)}
              aria-label={'Écouter · ' + names[phase]}
              onClick={() => act(() => (playing ? api.musicStop() : api.musicPreview(phase)))}
            >
              {playing ? <Square size={15} /> : <Play size={15} />}
              {playing ? 'Arrêter' : 'Écouter'}
            </button>
          </div>
          {draft.source === 'local' ? (
            <div className="local-track">
              <Music2 size={20} />
              <span>{audio?.name || 'Aucun MP3'}</span>
              <button disabled={busy} onClick={() => act(() => api.pickMusic(phase))}>
                {audio ? 'Remplacer' : 'Choisir un MP3'}
              </button>
              {audio && (
                <button
                  className="icon-button"
                  aria-label={'Retirer le MP3 · ' + names[phase]}
                  onClick={() => act(() => api.removeMusic(phase))}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="choice-buttons" role="group" aria-label={'Choix · ' + names[phase]}>
                {[
                  ['track', 'Un titre'],
                  ['selection', 'Titres aléatoires'],
                  ['playlist', 'Une playlist'],
                ].map(([mode, label]) => (
                  <button
                    key={mode}
                    aria-pressed={draft.mode === mode}
                    onClick={() => update({ mode, links: '', items: [] })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="selected-tracks">
                {items.map((item) => (
                  <TrackRow
                    key={item.uri}
                    item={item}
                    label="Retirer"
                    action={() => setItems(items.filter((i) => i.uri !== item.uri))}
                  />
                ))}
              </div>
              <Picker
                mode={draft.mode}
                items={items}
                choose={choose}
                connected={connected}
                phase={phase}
              />
            </>
          )}
          {dirty && (
            <div className="music-options-row">
              <button className="primary" disabled={busy} onClick={() => save(draft)}>
                Enregistrer
              </button>
              <button
                onClick={() => {
                  setDraft(slot);
                  setDirty(false);
                }}
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default function MusicSettings({ settings, data, act, busy, status }) {
  const [clientId, setClient] = useState(''),
    [connecting, setConnecting] = useState(false),
    [devices, setDevices] = useState([]),
    [connectionError, setConnectionError] = useState('');
  const refresh = () => act(async () => setDevices(await api.spotifyDevices()));
  useEffect(() => {
    if (status?.spotify?.connected)
      api
        .spotifyDevices()
        .then(setDevices)
        .catch(() => {});
  }, [status?.spotify?.connected]);
  const connect = async (id) => {
    setConnecting(true);
    setConnectionError('');
    try {
      await api.spotifyConnect(id);
    } catch (e) {
      setConnectionError(e.message.replace(/^.*Error: /, ''));
    } finally {
      setConnecting(false);
    }
  };
  return (
    <section className="settings-section">
      <h2>
        <Music2 size={19} />
        Musique
      </h2>
      <details className="spotify-setup">
        <summary>{status?.spotify?.connected ? 'Spotify connecté' : 'Connecter Spotify'}</summary>
        {status?.spotify?.connected && (
          <div className="music-options-row">
            <select
              aria-label="Appareil Spotify"
              value={settings.spotifyDevice}
              onChange={(e) => act(() => api.settings({ spotifyDevice: e.target.value }))}
            >
              <option value="">Choisir l’appareil</option>
              {settings.spotifyDevice && !devices.some((d) => d.id === settings.spotifyDevice) && (
                <option value={settings.spotifyDevice}>Appareil indisponible</option>
              )}
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button onClick={refresh}>Actualiser</button>
            <button onClick={() => act(() => api.spotifyDisconnect())}>Déconnecter</button>
          </div>
        )}
        {status?.spotify?.connected && status?.spotify?.canReconnect && (
          <button disabled={connecting} onClick={() => connect()}>
            Actualiser les autorisations
          </button>
        )}
        {
          <details open={!status?.spotify?.connected}>
            <summary>Utiliser ma configuration Spotify · Premium</summary>
            <p>Créez votre application Spotify et ajoutez cette adresse de redirection :</p>
            <code>{status?.spotify?.redirect}</code>
            <div className="music-options-row">
              <button onClick={() => api.spotifySetup()}>Spotify Developers</button>
              <input
                aria-label="Spotify Client ID"
                placeholder="Client ID"
                value={clientId}
                onChange={(e) => setClient(e.target.value)}
              />
              <button disabled={connecting || !clientId.trim()} onClick={() => connect(clientId)}>
                Se connecter
              </button>
            </div>
          </details>
        }
        {status?.spotify?.sharedClient && !status?.spotify?.connected && (
          <details>
            <summary>Accès test FocusReplay · sur invitation</summary>
            <p>
              Réservé aux comptes ajoutés par FocusReplay dans Spotify Developers (5 comptes
              maximum).
            </p>
            <button disabled={connecting} onClick={() => connect()}>
              Se connecter avec une invitation
            </button>
          </details>
        )}
        {connecting && (
          <button onClick={() => api.spotifyDisconnect()}>Annuler la connexion</button>
        )}
        {connectionError && <p role="alert">{connectionError}</p>}
      </details>
      {status?.error && <p role="alert">{status.error}</p>}
      {Object.keys(names).map((phase) => (
        <Slot
          key={phase}
          phase={phase}
          slot={settings.musicSlots[phase]}
          audio={data.localAudio?.[phase]}
          busy={busy}
          connected={status?.spotify?.connected}
          status={status}
          act={act}
          save={(slot) =>
            act(() => api.settings({ musicSlots: { ...settings.musicSlots, [phase]: slot } }))
          }
        />
      ))}
      <label className="setting-row">
        <span>Volume MP3</span>
        <input
          aria-label="Volume de la musique"
          type="range"
          min="0"
          max="1"
          step="0.05"
          defaultValue={settings.volume}
          onPointerUp={(e) => act(() => api.settings({ volume: Number(e.target.value) }))}
          onKeyUp={(e) => act(() => api.settings({ volume: Number(e.target.value) }))}
        />
      </label>
    </section>
  );
}
