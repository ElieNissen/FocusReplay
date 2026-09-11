const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const REDIRECT = 'http://127.0.0.1:43827/callback';
const { clientId: sharedClientId } = require('./spotify-app.json');
const { spotifyUri } = require('./music-config.cjs');
function catalogItem(item) {
  return {
    uri: item.uri,
    name: String(item.name || 'Sans titre').slice(0, 300),
    subtitle: String(
      item.artists?.map((a) => a.name).join(', ') || item.owner?.display_name || 'Playlist',
    ).slice(0, 500),
    image:
      (item.album?.images || item.images || []).find((i) =>
        /^https:\/\/i\.scdn\.co\/image\/[a-zA-Z0-9]+$/.test(i.url),
      )?.url || '',
  };
}
class Spotify {
  constructor({ dir, encryption, open, fetcher = fetch, onChange = () => {} }) {
    Object.assign(this, { encryption, open, fetcher, onChange });
    this.file = path.join(dir, 'spotify-auth.bin');
    this.auth = null;
    this.generation = 0;
  }
  status() {
    return {
      connected: Boolean(this.auth?.refresh_token),
      connecting: Boolean(this.cancelLogin),
      redirect: REDIRECT,
      sharedClient: Boolean(sharedClientId),
      canReconnect: Boolean(this.auth?.clientId || sharedClientId),
      libraryAccess: Boolean(this.auth?.scope?.includes('playlist-read-private')),
      connectionMode: this.auth?.clientId === sharedClientId ? 'invitation' : 'personal',
    };
  }
  async init() {
    try {
      if (this.encryption.isEncryptionAvailable())
        this.auth = JSON.parse(this.encryption.decryptString(await fs.readFile(this.file)));
    } catch {
      this.auth = null;
    }
  }
  async persist() {
    if (!this.encryption.isEncryptionAvailable())
      throw new Error('Le chiffrement Windows est indisponible.');
    const generation = this.generation,
      value = this.encryption.encryptString(JSON.stringify(this.auth));
    this.writing = (this.writing || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (generation !== this.generation) return;
        await fs.writeFile(this.file + '.tmp', value);
        await fs.rename(this.file + '.tmp', this.file);
      });
    await this.writing;
  }
  async token(params) {
    const response = await this.fetcher('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(12000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Connexion Spotify expirée ou refusée. Reconnectez Spotify.');
    const value = await response.json().catch(() => {
      throw new Error('Réponse de connexion Spotify illisible. Réessayez la connexion.');
    });
    if (!value.access_token || !Number.isFinite(value.expires_in))
      throw new Error('Réponse Spotify invalide.');
    return { ...value, expiresAt: Date.now() + value.expires_in * 1000 };
  }
  async connect(clientId) {
    clientId ||= this.auth?.clientId || sharedClientId;
    if (this.cancelLogin) throw new Error('Une connexion Spotify est déjà ouverte.');
    if (typeof clientId !== 'string' || !/^[a-f0-9]{32}$/i.test(clientId.trim()))
      throw new Error('Collez le Client ID de votre application Spotify.');
    if (!this.encryption.isEncryptionAvailable())
      throw new Error('Le chiffrement Windows est indisponible.');
    clientId = clientId.trim();
    const generation = ++this.generation;
    const verifier = randomBytes(48).toString('base64url'),
      state = randomBytes(32).toString('base64url');
    let server, timeout;
    try {
      const code = await new Promise((resolve, reject) => {
        this.cancelLogin = () => reject(new Error('Connexion Spotify annulée.'));
        server = http.createServer((req, res) => {
          const url = new URL(req.url, REDIRECT);
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          if (
            req.method !== 'GET' ||
            url.pathname !== '/callback' ||
            url.searchParams.get('state') !== state
          ) {
            res.writeHead(400);
            res.end('Requête invalide.');
            return;
          }
          const result = url.searchParams.get('code');
          res.end(
            result
              ? 'Vous pouvez revenir dans FocusReplay.'
              : 'Connexion annulée. Vous pouvez fermer cette page.',
          );
          if (result) resolve(result);
          else reject(new Error('Connexion Spotify refusée.'));
        });
        server.on('error', () =>
          reject(
            new Error('Le port 43827 est occupé. Fermez l’autre connexion Spotify et réessayez.'),
          ),
        );
        server.listen(43827, '127.0.0.1', () => {
          const query = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            redirect_uri: REDIRECT,
            code_challenge_method: 'S256',
            code_challenge: createHash('sha256').update(verifier).digest('base64url'),
            state,
            scope:
              'user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative',
          });
          this.open('https://accounts.spotify.com/authorize?' + query).catch(() =>
            reject(new Error('Impossible d’ouvrir la connexion Spotify.')),
          );
        });
        timeout = setTimeout(
          () => reject(new Error('Connexion Spotify expirée. Réessayez.')),
          180000,
        );
        this.onChange();
      });
      const credentials = await this.token({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: REDIRECT,
        code_verifier: verifier,
      });
      if (generation !== this.generation) return;
      this.auth = { ...credentials, clientId };
      await this.persist();
    } finally {
      clearTimeout(timeout);
      server?.close();
      server?.closeAllConnections();
      this.cancelLogin = null;
      this.onChange();
    }
    return this.status();
  }
  async disconnect() {
    ++this.generation;
    this.cancelLogin?.();
    await this.refreshing?.catch(() => {});
    await this.writing?.catch(() => {});
    this.auth = null;
    await fs.rm(this.file, { force: true });
    await fs.rm(this.file + '.tmp', { force: true });
    this.onChange();
  }
  async access(force = false) {
    if (!this.auth?.refresh_token)
      throw new Error('Connectez Spotify dans les réglages de musique.');
    if (!force && this.auth.expiresAt > Date.now() + 30000) return this.auth.access_token;
    if (!this.refreshing) {
      const generation = this.generation;
      this.refreshing = (async () => {
        const value = await this.token({
          grant_type: 'refresh_token',
          client_id: this.auth.clientId,
          refresh_token: this.auth.refresh_token,
        });
        if (generation !== this.generation) throw new Error('Spotify déconnecté.');
        this.auth = { ...this.auth, ...value };
        await this.persist();
        return this.auth.access_token;
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }
  async request(endpoint, method = 'GET', body, retry = true) {
    if (
      !/^\/(?:me\/player(?:[/?]|$)|me\/playlists\?|search\?|(?:tracks|playlists)\/[a-zA-Z0-9]{22}$)/.test(
        endpoint,
      )
    )
      throw new Error('Commande Spotify invalide.');
    const token = await this.access();
    const response = await this.fetcher('https://api.spotify.com/v1' + endpoint, {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12000),
      redirect: 'error',
    });
    if (response.status === 401 && retry) {
      await this.access(true);
      return this.request(endpoint, method, body, false);
    }
    if (response.status === 403)
      throw new Error(
        'Spotify refuse l’accès. Vérifiez Premium. L’accès test FocusReplay exige une invitation ; sinon utilisez votre configuration Spotify personnelle.',
      );
    if (response.status === 404)
      throw new Error('Ouvrez Spotify sur le PC et lancez un titre une première fois.');
    if (response.status === 429)
      throw new Error('Spotify demande une pause. Réessayez dans quelques minutes.');
    if (!response.ok)
      throw new Error('Spotify est indisponible. Réessayez après avoir vérifié la connexion.');
    // Playback commands acknowledge success without a JSON payload (including some 200s).
    if (response.status === 204 || method !== 'GET') return null;
    return response.json().catch(() => {
      throw new Error('Réponse Spotify illisible. Réessayez dans quelques instants.');
    });
  }
  async search(query, offset = 0) {
    if (
      typeof query !== 'string' ||
      !query.trim() ||
      query.length > 200 ||
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > 1000
    )
      throw new Error('Recherche invalide.');
    const result = await this.request(
      '/search?' +
        new URLSearchParams({
          q: query.trim(),
          type: 'track',
          limit: '10',
          offset: String(offset),
        }),
    );
    return {
      items: (result.tracks?.items || []).filter((i) => i?.uri).map(catalogItem),
      more: Boolean(result.tracks?.next),
    };
  }
  async playlists(offset = 0) {
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
      throw new Error('Page invalide.');
    if (!this.status().libraryAccess)
      throw new Error('Reconnectez Spotify pour autoriser l’accès à vos playlists.');
    const result = await this.request('/me/playlists?limit=50&offset=' + offset);
    return {
      items: (result.items || []).filter((i) => i?.uri).map(catalogItem),
      more: Boolean(result.next),
    };
  }
  async resolve(value, kind) {
    if (!['track', 'playlist'].includes(kind)) throw new Error('Type invalide.');
    const uri = spotifyUri(value, kind);
    return catalogItem(await this.request('/' + kind + 's/' + uri.split(':')[2]));
  }
  async play(selection, signal, deviceId) {
    signal.throwIfAborted();
    const devices = (await this.request('/me/player/devices')).devices || [];
    const device = devices.find((d) => d.id === deviceId && !d.is_restricted);
    if (!device) throw new Error('Choisissez un appareil Spotify disponible dans les réglages.');
    const suffix = 'device_id=' + encodeURIComponent(device.id);
    const command = (name, body, query = '') =>
      this.request('/me/player/' + name + '?' + suffix + query, 'PUT', body);
    let started = false;
    const owns = (value) =>
      value?.device?.id === device.id &&
      (selection.context_uri
        ? value.context?.uri === selection.context_uri
        : selection.uris.includes(value.item?.uri) ||
          selection.uris.includes(value.item?.linked_from?.uri));
    try {
      signal.throwIfAborted();
      await command('repeat', undefined, '&state=off');
      signal.throwIfAborted();
      await command('shuffle', undefined, '&state=false');
      signal.throwIfAborted();
      await command('play', { ...selection, position_ms: 0 });
      started = true;
      let matched = false;
      const waitUntil = Date.now() + 15000;
      while (!signal.aborted) {
        const current = await this.request('/me/player');
        if (owns(current)) {
          matched = true;
          const remaining = current.item.duration_ms - current.progress_ms;
          if (!current.is_playing) return remaining < 1500;
          const finalTrack =
            selection.uris &&
            (current.item.uri === selection.uris.at(-1) ||
              current.item.linked_from?.uri === selection.uris.at(-1));
          // Stop the explicit list at its end, before Spotify can start recommendations.
          if (finalTrack && remaining <= 180) {
            await command('pause');
            started = false;
            return;
          }
          await delay(
            finalTrack ? Math.max(30, Math.min(2000, remaining - 120)) : 2000,
            undefined,
            { signal },
          );
        } else {
          // A user-selected track/device takes precedence over this automation.
          if (matched || Date.now() > waitUntil) {
            started = false;
            return false;
          }
          await delay(700, undefined, { signal });
        }
      }
    } finally {
      if (started) {
        // Check ownership again so ending a session never pauses a different device/song.
        const current = await this.request('/me/player').catch(() => null);
        if (owns(current) && current.is_playing) await command('pause');
      }
    }
  }
}
module.exports = { Spotify, REDIRECT };
