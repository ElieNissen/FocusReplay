const fs = require('node:fs/promises');
const path = require('node:path');
const { buildSnapshot, hidden } = require('./share-snapshot.cjs');
const { mergeHistory } = require('./share-history.cjs');
const { mediaPlan, encodeMedia } = require('./share-media.cjs');
class Publisher {
  constructor({ recorder, safeStorage, nativeImage, fetcher = fetch }) {
    Object.assign(this, { recorder, safeStorage, nativeImage, fetcher });
    this.auth = null;
    this.uploaded = new Set();
    this.error = '';
    this.lastSync = 0;
    this.busy = false;
    this.inflight = null;
  }
  async init() {
    try {
      this.auth = JSON.parse(
        this.safeStorage.decryptString(
          await fs.readFile(path.join(this.recorder.dir, 'share-auth.bin')),
        ),
      );
    } catch {}
  }
  state() {
    return {
      connected: Boolean(this.auth),
      url: this.auth ? this.auth.url + '/?profile=' + this.auth.profile : '',
      configured: Boolean(this.auth?.configured),
      enabled: this.recorder.data.settings.shareEnabled,
      lastSync: this.lastSync,
      error: this.error,
      busy: this.busy,
      pendingRemoval: Boolean(this.auth?.pendingClear),
    };
  }
  async save() {
    if (!this.safeStorage.isEncryptionAvailable())
      throw Error('Le stockage sécurisé Windows est indisponible.');
    const target = path.join(this.recorder.dir, 'share-auth.bin');
    await fs.writeFile(target + '.tmp', this.safeStorage.encryptString(JSON.stringify(this.auth)));
    await fs.rename(target + '.tmp', target);
  }
  async connect(file) {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    const url = new URL(value.url);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      !/^[a-z0-9-]{1,48}$/.test(value.profile) ||
      !/^[a-f0-9]{64}$/.test(value.key)
    )
      throw Error('Fichier de connexion invalide.');
    this.auth = {
      url: url.origin,
      key: value.key,
      profile: value.profile,
      configured: false,
      since: Date.now(),
    };
    await this.save();
    return this.state();
  }
  async login({ url: address, profile, email, password, invitation, register = false }) {
    const url = new URL(address);
    if (
      (url.protocol !== 'https:' &&
        !(
          url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        )) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw Error('Utilisez l’adresse HTTPS de votre serveur.');
    if (
      ((register || !email) && !/^[a-z0-9][a-z0-9-]{2,39}$/.test(profile || '')) ||
      typeof password !== 'string' ||
      password.length < 12 ||
      password.length > 128
    )
      throw Error('Vérifiez votre identifiant et votre mot de passe.');
    const response = await this.fetcher(
      url.origin + '/api/account/' + (register ? 'register' : 'login'),
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, email, password, invitation }),
      },
    );
    const value = await response.json();
    if (!response.ok) throw Error(value.error || 'Connexion impossible.');
    if (
      !/^[a-f0-9]{64}$/.test(value.key) ||
      !/^[a-z0-9][a-z0-9-]{2,39}$/.test(value.profile || '') ||
      (register && value.profile !== profile)
    )
      throw Error('Réponse du serveur invalide.');
    profile = value.profile;
    const since =
      this.auth?.profile === profile && this.auth.url === url.origin ? this.auth.since : Date.now();
    this.auth = {
      url: url.origin,
      profile,
      key: value.key,
      configured: value.configured === true,
      since,
    };
    await this.save();
    this.uploaded.clear();
    this.error = '';
    return this.state();
  }
  async request(route, options = {}) {
    const r = await this.fetcher(
      this.auth.url + '/api/p/' + this.auth.profile + route.replace(/^\/api/, ''),
      {
        ...options,
        redirect: 'error',
        headers: { Authorization: 'Bearer ' + this.auth.key, ...options.headers },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok) throw Error('Le site ne répond pas au partage (' + r.status + ').');
    return r;
  }
  async configure(password) {
    if (!this.auth) throw Error('Connectez le site.');
    if (typeof password !== 'string' || password.length < 12 || password.length > 128)
      throw Error('Choisissez un mot de passe de 12 à 128 caractères.');
    await this.request('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    this.auth.configured = true;
    await this.save();
    return this.state();
  }
  async social(value) {
    if (!this.auth) throw Error('Connectez votre compte.');
    const r = await this.request(
      value ? '/api/social/profile' : '/api/social',
      value
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(value),
          }
        : {},
    );
    return r.json();
  }
  async clear() {
    await this.inflight;
    if (!this.auth) return;
    this.auth.pendingClear = true;
    await this.save();
    return this.removePending();
  }
  async removePending() {
    await this.request('/api/snapshot', { method: 'DELETE' });
    this.auth.pendingClear = false;
    await this.save();
    this.uploaded.clear();
    this.lastSync = 0;
    this.error = '';
    return this.state();
  }
  sync() {
    if (this.inflight) return this.inflight;
    this.inflight = (this.auth?.pendingClear ? this.removePending() : this.transfer())
      .catch((e) => {
        this.error = e.message;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }
  async transfer() {
    if (this.busy || !this.auth?.configured || !this.recorder.data.settings.shareEnabled) return;
    this.busy = true;
    this.error = '';
    try {
      const social = await this.social();
      const policy = social.me?.sharing;
      if (!policy) throw Error('Mettez le serveur à jour pour configurer le partage des images.');
      const previous = await (await this.request('/api/snapshot')).json();
      for (const f of previous?.frames || []) {
        if (f.private) continue;
        if (!f.media && f.available) this.uploaded.add(f.id);
        for (const m of Object.values(f.media || {})) if (m.available) this.uploaded.add(m.id);
      }
      const fresh = () => {
        const snapshot = mergeHistory(
          previous,
          buildSnapshot(this.recorder.snapshot(), this.auth.since),
          this.recorder.data.settings,
        );
        const local = new Map(
          this.recorder.data.sessions.flatMap((s) => s.frames).map((f) => [f.id, f]),
        );
        snapshot.frames = snapshot.frames.map((f) => {
          const camera =
            local.get(f.id)?.camera || Object.keys(f.media || {}).some((k) => k.endsWith('Camera'));
          const media = mediaPlan(f, policy, camera);
          // Keep existing authorized derivatives when local originals have expired.
          if (!local.has(f.id) && !f.private) {
            const stored =
              f.media ||
              (f.available
                ? { profileScreen: { id: f.id, mode: 'visible', available: true } }
                : {});
            for (const [key, m] of Object.entries(stored)) {
              if (m.available && policy[key] === m.mode) media[key] = { ...m };
            }
          }
          for (const m of Object.values(media)) m.available = this.uploaded.has(m.id);
          return { ...f, media, available: !!media.profileScreen?.available };
        });
        return snapshot;
      };
      const snapshot = fresh();
      const allowed = new Set(
        snapshot.frames.flatMap((f) => Object.values(f.media || {}).map((m) => m.id)),
      );
      for (const id of this.uploaded) if (!allowed.has(id)) this.uploaded.delete(id);
      const commit = () =>
        this.request('/api/snapshot', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(snapshot),
        });
      // Revoke newly hidden frames before uploading anything else.
      await commit();
      for (const f of snapshot.frames) {
        if (!this.recorder.data.settings.shareEnabled) break;
        if (f.private) continue;
        for (const [key, m] of Object.entries(f.media)) {
          if (this.uploaded.has(m.id)) continue;
          let bytes;
          try {
            bytes = await fs.readFile(
              key.endsWith('Camera')
                ? this.recorder.cameraPath(f.id)
                : this.recorder.framePath(f.id),
            );
          } catch (e) {
            if (e.code === 'ENOENT') continue;
            throw e;
          }
          const jpeg = encodeMedia(this.nativeImage, bytes, m.mode, key.endsWith('Camera'));
          // Recheck privacy after asynchronous file/network work.
          const latest = buildSnapshot(this.recorder.snapshot(), this.auth.since).frames.find(
            (x) => x.id === f.id,
          );
          if (!latest || latest.private) {
            f.private = true;
            continue;
          }
          await this.request('/api/image/' + m.id, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: jpeg,
          });
          this.uploaded.add(m.id);
        }
      }
      // Always use fresh masking rules at the end of a transfer.
      if (this.recorder.data.settings.shareEnabled) {
        await this.request('/api/snapshot', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...fresh(),
            frames: fresh().frames,
          }),
        });
        this.lastSync = Date.now();
      }
    } catch (e) {
      this.error = e.message;
    } finally {
      this.busy = false;
    }
  }
}
module.exports = { Publisher };
