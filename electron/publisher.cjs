const fs = require('node:fs/promises');
const path = require('node:path');
const { buildSnapshot, hidden } = require('./share-snapshot.cjs');
const { mergeHistory } = require('./share-history.cjs');
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
      const previous = await (await this.request('/api/snapshot')).json();
      for (const f of previous?.frames || [])
        if (f.available && !f.private) this.uploaded.add(f.id);
      const fresh = () =>
        mergeHistory(
          previous,
          buildSnapshot(this.recorder.snapshot(), this.auth.since),
          this.recorder.data.settings,
        );
      const snapshot = fresh();
      const allowed = new Set(snapshot.frames.filter((f) => !f.private).map((f) => f.id));
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
        if (f.private || this.uploaded.has(f.id)) continue;
        const bytes = await fs.readFile(this.recorder.framePath(f.id));
        let image = this.nativeImage.createFromBuffer(bytes).resize({ width: 1024 });
        let jpeg = image.toJPEG(50);
        if (jpeg.length > 50000) jpeg = image.resize({ width: 800 }).toJPEG(35);
        if (jpeg.length > 50000) jpeg = image.resize({ width: 640 }).toJPEG(25);
        if (jpeg.length > 50000) throw Error('Une capture dépasse la taille maximale de partage.');
        // Recheck privacy after asynchronous file/network work.
        const latest = buildSnapshot(this.recorder.snapshot(), this.auth.since).frames.find(
          (x) => x.id === f.id,
        );
        if (!latest || latest.private) {
          f.private = true;
          continue;
        }
        await this.request('/api/image/' + f.id, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: jpeg,
        });
        this.uploaded.add(f.id);
      }
      // Always use fresh masking rules at the end of a transfer.
      if (this.recorder.data.settings.shareEnabled) {
        await this.request('/api/snapshot', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...fresh(),
            frames: fresh().frames.map((f) => ({
              ...f,
              available: !f.private && this.uploaded.has(f.id),
            })),
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
