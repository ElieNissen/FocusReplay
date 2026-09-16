import Choice from './Choice';
import { Button } from '@heroui/react';
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
      <Button
        variant="ghost"
        type="submit"
        className="icon-button"
        title="Ouvrir dans Spotify"
        aria-label={'Ouvrir dans Spotify · ' + item.name}
        onPress={() => api.spotifyOpen(item.uri)}
      >
        <ExternalLink size={14} />
      </Button>
      <Button
        variant="ghost"
        type="submit"
        className="icon-button"
        aria-label={label + ' · ' + item.name}
        title={label}
        isDisabled={disabled}
        onPress={action}
      >
        {label === 'Retirer' ? <X size={16} /> : <Plus size={16} />}
      </Button>
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
          <Button
            variant="tertiary"
            type="submit"
            isDisabled={!connected || loading}
            onPress={() => load()}
          >
            Actualiser
          </Button>
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
        <Button
          variant="tertiary"
          type="submit"
          isDisabled={loading}
          onPress={() => load(page.current + (mode === 'playlist' ? 50 : 10))}
        >
          Afficher plus
        </Button>
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
          <Button variant="tertiary" type="submit" isDisabled={!connected}>
            Ajouter
          </Button>
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
      <Toggle
        label={names[phase]}
        className="toggle"
        checked={slot.enabled}
        disabled={busy}
        onChange={(e) => save({ ...slot, enabled: e.target.checked })}
      />
      {slot.enabled && (
        <div className="music-slot-options">
          <div className="music-options-row">
            <Choice
              label={'Source · ' + names[phase]}
              value={draft.source}
              options={[
                ['local', 'MP3'],
                ['spotify', 'Spotify'],
              ]}
              onChange={(source) => update({ source })}
            />
            <Button
              variant="tertiary"
              type="submit"
              isDisabled={busy || dirty || (draft.source === 'local' ? !audio : !items.length)}
              aria-label={'Écouter · ' + names[phase]}
              onPress={() => act(() => (playing ? api.musicStop() : api.musicPreview(phase)))}
            >
              {playing ? <Square size={15} /> : <Play size={15} />}
              {playing ? 'Arrêter' : 'Écouter'}
            </Button>
          </div>
          {draft.source === 'local' ? (
            <div className="local-track">
              <Music2 size={20} />
              <span>{audio?.name || 'Aucun MP3'}</span>
              <Button
                variant="tertiary"
                type="submit"
                isDisabled={busy}
                onPress={() => act(() => api.pickMusic(phase))}
              >
                {audio ? 'Remplacer' : 'Choisir un MP3'}
              </Button>
              {audio && (
                <Button
                  variant="ghost"
                  type="submit"
                  className="icon-button"
                  aria-label={'Retirer le MP3 · ' + names[phase]}
                  onPress={() => act(() => api.removeMusic(phase))}
                >
                  <X size={16} />
                </Button>
              )}
            </div>
          ) : (
            <>
              <Choice
                label={'Choix · ' + names[phase]}
                value={draft.mode}
                options={[
                  ['track', 'Un titre'],
                  ['selection', 'Titres aléatoires'],
                  ['playlist', 'Une playlist'],
                ]}
                onChange={(mode) => update({ mode, links: '', items: [] })}
              />
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
              <Button
                variant="primary"
                type="submit"
                className="primary"
                isDisabled={busy}
                onPress={() => save(draft)}
              >
                Enregistrer
              </Button>
              <Button
                variant="tertiary"
                type="submit"
                onPress={() => {
                  setDraft(slot);
                  setDirty(false);
                }}
              >
                Annuler
              </Button>
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
            <Button variant="tertiary" type="submit" onPress={refresh}>
              Actualiser
            </Button>
            <Button
              variant="tertiary"
              type="submit"
              onPress={() => act(() => api.spotifyDisconnect())}
            >
              Déconnecter
            </Button>
          </div>
        )}
        {status?.spotify?.connected && status?.spotify?.canReconnect && (
          <Button
            variant="tertiary"
            type="submit"
            isDisabled={connecting}
            onPress={() => connect()}
          >
            Actualiser les autorisations
          </Button>
        )}
        {
          <details open={!status?.spotify?.connected}>
            <summary>Utiliser ma configuration Spotify · Premium</summary>
            <p>Créez votre application Spotify et ajoutez cette adresse de redirection :</p>
            <code>{status?.spotify?.redirect}</code>
            <div className="music-options-row">
              <Button variant="tertiary" type="submit" onPress={() => api.spotifySetup()}>
                Spotify Developers
              </Button>
              <input
                aria-label="Spotify Client ID"
                placeholder="Client ID"
                value={clientId}
                onChange={(e) => setClient(e.target.value)}
              />
              <Button
                variant="tertiary"
                type="submit"
                isDisabled={connecting || !clientId.trim()}
                onPress={() => connect(clientId)}
              >
                Se connecter
              </Button>
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
            <Button
              variant="tertiary"
              type="submit"
              isDisabled={connecting}
              onPress={() => connect()}
            >
              Se connecter avec une invitation
            </Button>
          </details>
        )}
        {connecting && (
          <Button variant="tertiary" type="submit" onPress={() => api.spotifyDisconnect()}>
            Annuler la connexion
          </Button>
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
