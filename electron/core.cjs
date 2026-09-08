const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

const DEFAULTS = Object.freeze({
  interval: 60,
  retentionDays: 3,
  maxMB: 1024,
  width: 1920,
  quality: 72,
  displayId: '',
  musicEnabled: true,
  musicSeconds: 30,
  volume: 0.5,
  reminderMinutes: 15,
  widget: false,
  theme: 'dark',
  browserHints: true,
  distractionReminder: true,
  cameraEnabled: false,
  rewardsEnabled: false,
  pointsPerHour: 60,
  earnMode: 'work',
});
const DEFAULT_REWARDS = [
  { id: 'stretch', name: 'Se lever et souffler', minutes: 5, cost: 25 },
  { id: 'game', name: 'Une partie de jeu', minutes: 30, cost: 90 },
  { id: 'movie', name: 'Soirée film', minutes: 120, cost: 240 },
];
function newWallet() {
  return {
    earned: 0,
    spent: 0,
    workMs: 0,
    redemptions: [],
    activeBreak: null,
    rewards: DEFAULT_REWARDS.map((r) => ({ ...r })),
  };
}
function validateReward(reward) {
  if (
    !reward ||
    typeof reward.name !== 'string' ||
    !reward.name.trim() ||
    reward.name.length > 80 ||
    !Number.isInteger(reward.minutes) ||
    reward.minutes < 1 ||
    reward.minutes > 1440 ||
    !Number.isInteger(reward.cost) ||
    reward.cost < 1 ||
    reward.cost > 100000
  )
    throw new Error(
      'Indiquez un nom, une durée de 1 à 1440 minutes et un coût de 1 à 100 000 points.',
    );
  return { name: reward.name.trim(), minutes: reward.minutes, cost: reward.cost };
}
const UUID = /^[0-9a-f-]{36}$/;
function validateSettings(input, previous = DEFAULTS) {
  const s = { ...previous };
  const bounds = {
    interval: [10, 600],
    retentionDays: [1, 30],
    maxMB: [100, 10240],
    width: [960, 2560],
    quality: [40, 90],
    musicSeconds: [0, 600],
    volume: [0, 1],
    reminderMinutes: [0, 120],
    pointsPerHour: [1, 1000],
  };
  for (const [key, value] of Object.entries(input || {})) {
    if (key in bounds) {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < bounds[key][0] ||
        value > bounds[key][1]
      )
        throw new Error('Réglage invalide : ' + key);
      s[key] = key === 'volume' ? value : Math.round(value);
    } else if (
      [
        'musicEnabled',
        'widget',
        'browserHints',
        'distractionReminder',
        'cameraEnabled',
        'rewardsEnabled',
      ].includes(key)
    ) {
      if (typeof value !== 'boolean') throw new Error('Réglage invalide');
      s[key] = value;
    } else if (key === 'earnMode') {
      if (!['work', 'active'].includes(value)) throw new Error('Mode de points invalide');
      s[key] = value;
    } else if (key === 'theme') {
      if (!['light', 'dark', 'system'].includes(value)) throw new Error('Thème invalide');
      s[key] = value;
    } else if (key === 'displayId') {
      if (typeof value !== 'string' || value.length > 100) throw new Error('Écran invalide');
      s[key] = value;
    }
  }
  return s;
}
function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function selectFrames(sessions, { sessionId, day, from, to } = {}) {
  return sessions
    .filter((s) => !sessionId || s.id === sessionId)
    .flatMap((s) =>
      s.frames.map((f) => ({ ...f, sessionStart: s.startedAt, sessionId: s.id, events: s.events })),
    )
    .filter((f) => (!day || dayKey(f.at) === day) && (!from || f.at >= from) && (!to || f.at <= to))
    .sort((a, b) => a.at - b.at);
}
class Recorder extends EventEmitter {
  constructor({ dir, capture, activity = () => null, idle = () => 0, now = Date.now }) {
    super();
    this.dir = dir;
    this.capture = capture;
    this.activity = activity;
    this.idle = idle;
    this.now = now;
    this.data = {
      version: 1,
      settings: { ...DEFAULTS },
      sessions: [],
      music: false,
      wallet: newWallet(),
      pauseTimer: null,
    };
    this.queue = Promise.resolve();
    this.pins = new Set();
    this.systemPaused = false;
    this.lastTick = now();
    this.nextCapture = 0;
    this.lastSave = 0;
    this.lastClean = 0;
    this.warning = '';
    this.trackingAvailable = false;
  }
  run(fn) {
    const p = this.queue.then(fn);
    this.queue = p.catch(() => {});
    return p;
  }
  async init() {
    await fs.mkdir(path.join(this.dir, 'captures'), { recursive: true });
    try {
      const loaded = JSON.parse(await fs.readFile(path.join(this.dir, 'state.json'), 'utf8'));
      if (loaded.version !== 1 || !Array.isArray(loaded.sessions))
        throw new Error('Format inconnu');
      this.data = loaded;
      this.data.settings = validateSettings(loaded.settings);
    } catch (e) {
      if (e.code !== 'ENOENT')
        throw new Error(
          'Les données locales sont illisibles. Elles ont été conservées. Fermez FocusReplay et sauvegardez son dossier de données avant réparation.',
        );
    }
    this.data.wallet ||= newWallet();
    this.data.pauseTimer = null;
    for (const s of this.data.sessions)
      if (!s.endedAt) {
        s.endedAt = s.lastSeen || s.startedAt;
        s.status = 'interrupted';
        s.events.push({ at: s.endedAt, type: 'interrupted' });
      }
    // Only app-owned, UUID-named orphan capture files are eligible for cleanup.
    const known = new Set(
      this.data.sessions.flatMap((s) =>
        s.frames.flatMap((f) => [f.id + '.jpg', ...(f.camera ? [f.id + '-camera.jpg'] : [])]),
      ),
    );
    for (const name of await fs.readdir(path.join(this.dir, 'captures')))
      if (/^[0-9a-f-]{36}(?:-camera)?\.jpg(?:\.tmp)?$/.test(name) && !known.has(name))
        await fs.rm(path.join(this.dir, 'captures', name), { force: true });
    await this.clean();
    await this.save();
    return this.snapshot();
  }
  get active() {
    return this.data.sessions.find((s) => !s.endedAt);
  }
  snapshot() {
    return {
      ...this.data,
      systemPaused: this.systemPaused,
      warning: this.warning,
      cameraWarning: this.cameraWarning || '',
      trackingAvailable: this.trackingAvailable,
      bytes: this.data.sessions.reduce((n, s) => n + s.frames.reduce((m, f) => m + f.bytes, 0), 0),
    };
  }
  changed() {
    this.emit('change', this.snapshot());
  }
  async save() {
    const temp = path.join(this.dir, 'state.json.tmp');
    await fs.writeFile(temp, JSON.stringify(this.data));
    await fs.rename(temp, path.join(this.dir, 'state.json'));
    this.lastSave = this.now();
  }
  framePath(id) {
    if (!UUID.test(id)) throw new Error('Capture invalide');
    return path.join(this.dir, 'captures', id + '.jpg');
  }
  cameraPath(id) {
    if (!UUID.test(id)) throw new Error('Capture invalide');
    return path.join(this.dir, 'captures', id + '-camera.jpg');
  }
  async removeFiles(frame) {
    await fs.rm(this.framePath(frame.id), { force: true });
    if (frame.camera) await fs.rm(this.cameraPath(frame.id), { force: true });
  }
  hasFrame(id) {
    return this.data.sessions.some((s) => s.frames.some((f) => f.id === id));
  }
  async start() {
    return this.run(async () => {
      if (this.active) throw new Error('Une session est déjà en cours.');
      const at = this.now();
      const s = {
        id: randomUUID(),
        startedAt: at,
        lastSeen: at,
        endedAt: null,
        status: 'recording',
        frames: [],
        activity: [],
        events: [{ at, type: 'start' }],
      };
      this.data.sessions.push(s);
      this.lastTick = at;
      this.nextCapture = at;
      this.warning = '';
      await this.save();
      this.changed();
      return s.id;
    });
  }
  async pause() {
    return this.run(async () => {
      const s = this.active;
      if (!s) return;
      s.status = s.status === 'paused' ? 'recording' : 'paused';
      if (s.status === 'recording') {
        this.data.pauseTimer = null;
        this.data.wallet.activeBreak = null;
      }
      s.events.push({ at: this.now(), type: s.status === 'paused' ? 'pause' : 'resume' });
      this.lastTick = this.now();
      this.nextCapture = this.now();
      await this.save();
      this.changed();
    });
  }
  async pauseFor(minutes) {
    return this.run(async () => {
      const s = this.active;
      if (!s) throw new Error('Commencez une session avant de la mettre en pause.');
      if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440))
        throw new Error('Choisissez une durée entre 1 et 1440 minutes.');
      this.data.wallet.activeBreak = null;
      this.data.pauseTimer = {
        name: minutes === null ? 'Pause sans limite' : 'Votre pause',
        minutes,
        startedAt: this.now(),
        endsAt: minutes === null ? null : this.now() + minutes * 60000,
        notified: false,
      };
      s.status = 'paused';
      s.events.push({ at: this.now(), type: 'pause' });
      await this.save();
      this.changed();
    });
  }
  async stop() {
    return this.run(async () => {
      const s = this.active;
      if (!s) return;
      this.data.pauseTimer = null;
      s.endedAt = this.now();
      s.lastSeen = s.endedAt;
      s.status = 'finished';
      s.events.push({ at: s.endedAt, type: 'stop' });
      await this.save();
      this.changed();
    });
  }
  async systemPause(value) {
    return this.run(async () => {
      if (this.systemPaused === value) return;
      this.systemPaused = value;
      const s = this.active;
      if (s) s.events.push({ at: this.now(), type: value ? 'system-pause' : 'system-resume' });
      this.lastTick = this.now();
      this.nextCapture = this.now();
      await this.save();
      this.changed();
    });
  }
  async settings(input) {
    return this.run(async () => {
      this.data.settings = validateSettings(input, this.data.settings);
      this.nextCapture = Math.min(
        this.nextCapture,
        this.now() + this.data.settings.interval * 1000,
      );
      await this.clean();
      await this.save();
      this.changed();
    });
  }
  async tick() {
    return this.run(async () => {
      const at = this.now();
      const elapsed = Math.max(0, Math.min(5000, at - this.lastTick));
      this.lastTick = at;
      const wallet = this.data.wallet;
      const manualPause = this.data.pauseTimer;
      if (manualPause?.endsAt && !manualPause.notified && at >= manualPause.endsAt) {
        manualPause.notified = true;
        this.emit('break-ended', manualPause);
        await this.save();
        this.changed();
      }
      if (wallet.activeBreak && !wallet.activeBreak.notified && at >= wallet.activeBreak.endsAt) {
        wallet.activeBreak.notified = true;
        this.emit('break-ended', wallet.activeBreak);
        await this.save();
        this.changed();
      }
      if (at - this.lastClean >= 60000) {
        await this.clean();
        this.lastClean = at;
      }
      const s = this.active;
      if (s) s.lastSeen = at;
      const activity = this.activity();
      const app = typeof activity === 'string' ? activity : activity?.app;
      this.trackingAvailable = Boolean(app);
      const category =
        typeof activity === 'object' && activity ? activity.category || 'unknown' : 'unknown';
      if (s && s.status === 'recording' && !this.systemPaused) {
        const name = this.idle() >= 300 ? 'Inactivité (5 min+)' : app;
        if (name && elapsed) {
          const last = s.activity.at(-1);
          const cat = this.idle() >= 300 ? 'idle' : category;
          if (
            last &&
            last.app === name &&
            last.category === cat &&
            at - last.to < 6000 &&
            dayKey(last.from) === dayKey(at)
          ) {
            last.to = at;
            last.ms += elapsed;
          } else
            s.activity.push({
              app: String(name).slice(0, 100),
              category: cat,
              from: at - elapsed,
              to: at,
              ms: elapsed,
            });
          if (
            this.data.settings.rewardsEnabled &&
            !wallet.activeBreak &&
            cat !== 'idle' &&
            (cat === 'work' || this.data.settings.earnMode === 'active')
          ) {
            wallet.earned += (elapsed / 3600000) * this.data.settings.pointsPerHour;
            wallet.workMs += elapsed;
          }
        }
        if (at >= this.nextCapture) {
          this.nextCapture = at + this.data.settings.interval * 1000;
          try {
            const stat = await fs.statfs(this.dir);
            if (Number(stat.bavail) * Number(stat.bsize) < 100 * 1024 * 1024)
              throw new Error(
                'Disque presque plein. Libérez de l’espace pour reprendre les captures.',
              );
            const {
              bytes,
              display,
              width,
              height,
              camera,
              cameraWarning,
              at: capturedAt,
            } = await this.capture(this.data.settings);
            if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error('Capture vide.');
            const id = randomUUID();
            const target = this.framePath(id);
            await fs.writeFile(target + '.tmp', bytes);
            await fs.rename(target + '.tmp', target);
            let savedCamera = false;
            this.cameraWarning = cameraWarning || '';
            if (camera?.bytes) {
              try {
                await fs.writeFile(this.cameraPath(id) + '.tmp', camera.bytes);
                await fs.rename(this.cameraPath(id) + '.tmp', this.cameraPath(id));
                savedCamera = true;
              } catch {
                this.cameraWarning =
                  'La photo caméra n’a pas pu être enregistrée. La capture d’écran est conservée.';
              }
            }
            s.frames.push({
              id,
              at: capturedAt || this.now(),
              interval: this.data.settings.interval,
              app: name || 'Logiciel non identifié',
              category: this.idle() >= 300 ? 'idle' : category,
              display,
              width,
              height,
              camera: savedCamera,
              cameraAt: savedCamera ? camera.at : null,
              bytes: bytes.length + (savedCamera ? camera.bytes.length : 0),
            });
            this.warning = '';
            await this.clean();
            await this.save();
            this.changed();
          } catch (e) {
            this.warning = e.message || 'La capture a échoué.';
            s.events.push({ at, type: 'capture-error' });
            await this.save();
            this.changed();
          }
        }
      }
      if (at - this.lastSave >= 10000) {
        await this.save();
        this.changed();
      }
    });
  }
  async clean() {
    const cutoff = this.now() - this.data.settings.retentionDays * 86400000;
    const all = this.data.sessions
      .flatMap((s) => s.frames.map((f) => ({ s, f })))
      .sort((a, b) => a.f.at - b.f.at);
    let bytes = all.reduce((n, x) => n + x.f.bytes, 0);
    const quota = this.data.settings.maxMB * 1024 * 1024;
    for (const { s, f } of all)
      if (!this.pins.has(f.id) && (f.at < cutoff || bytes > quota)) {
        await this.removeFiles(f);
        s.frames = s.frames.filter((x) => x.id !== f.id);
        bytes -= f.bytes;
      }
    this.data.sessions = this.data.sessions.filter(
      (s) => !s.endedAt || s.endedAt >= cutoff || s.frames.some((f) => this.pins.has(f.id)),
    );
    for (const s of this.data.sessions) {
      s.activity = s.activity.filter((a) => a.to >= cutoff);
      s.events = s.events.filter((e) => e.at >= cutoff);
    }
  }
  async deleteSession(id) {
    return this.run(async () => {
      const s = this.data.sessions.find((x) => x.id === id);
      if (!s) return;
      if (!s.endedAt) throw new Error('Terminez cette session avant de la supprimer.');
      if (s.frames.some((f) => this.pins.has(f.id)))
        throw new Error('Un export utilise cette session. Attendez sa fin.');
      for (const f of s.frames) await this.removeFiles(f);
      this.data.sessions = this.data.sessions.filter((x) => x.id !== id);
      await this.save();
      this.changed();
    });
  }
  async deleteFrame(id) {
    return this.run(async () => {
      if (this.pins.has(id)) throw new Error('Capture utilisée par un export.');
      for (const s of this.data.sessions) {
        const frame = s.frames.find((f) => f.id === id);
        if (frame) {
          await this.removeFiles(frame);
          s.frames = s.frames.filter((f) => f.id !== id);
        }
      }
      await this.save();
      this.changed();
    });
  }
  async saveReward(input) {
    return this.run(async () => {
      const reward = validateReward(input);
      const existing = this.data.wallet.rewards.find((r) => r.id === input.id);
      if (existing) Object.assign(existing, reward);
      else {
        if (this.data.wallet.rewards.length >= 20) throw new Error('20 récompenses maximum.');
        this.data.wallet.rewards.push({ ...reward, id: randomUUID() });
      }
      await this.save();
      this.changed();
    });
  }
  async deleteReward(id) {
    return this.run(async () => {
      this.data.wallet.rewards = this.data.wallet.rewards.filter((r) => r.id !== id);
      await this.save();
      this.changed();
    });
  }
  async redeemReward(id) {
    return this.run(async () => {
      const w = this.data.wallet,
        reward = w.rewards.find((r) => r.id === id);
      if (!this.data.settings.rewardsEnabled || !reward)
        throw new Error('Récompense indisponible.');
      if (w.activeBreak) throw new Error('Terminez la pause en cours avant une autre récompense.');
      if (Math.floor(w.earned - w.spent + 1e-8) < reward.cost)
        throw new Error('Pas encore assez de points.');
      this.data.pauseTimer = null;
      w.spent += reward.cost;
      w.activeBreak = {
        ...reward,
        startedAt: this.now(),
        endsAt: this.now() + reward.minutes * 60000,
        notified: false,
      };
      w.redemptions.push({
        name: reward.name,
        minutes: reward.minutes,
        cost: reward.cost,
        at: this.now(),
      });
      w.redemptions = w.redemptions.slice(-50);
      const s = this.active;
      if (s && s.status === 'recording') {
        s.status = 'paused';
        s.events.push({ at: this.now(), type: 'pause' });
      }
      await this.save();
      this.changed();
    });
  }
  async finishBreak() {
    return this.run(async () => {
      this.data.wallet.activeBreak = null;
      await this.save();
      this.changed();
    });
  }
}
module.exports = {
  Recorder,
  DEFAULTS,
  validateSettings,
  selectFrames,
  dayKey,
  validateReward,
  newWallet,
};
