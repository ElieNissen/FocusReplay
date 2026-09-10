const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { classify } = require('./tracker.cjs');
const { domainOnly, siteCategory } = require('./sites.cjs');
const { defaults: musicSlots, validateMusic } = require('./music-config.cjs');

const DEFAULTS = Object.freeze({
  interval: 60,
  retentionDays: 90,
  maxMB: 1024,
  width: 1920,
  quality: 72,
  displayId: '',
  musicEnabled: true,
  musicSlots,
  spotifyDevice: '',
  musicSeconds: 0,
  volume: 0.5,
  soundEnabled: true,
  soundVolume: 0.3,
  reminderMinutes: 15,
  widget: false,
  theme: 'dark',
  browserHints: true,
  distractionReminder: true,
  cameraEnabled: false,
  rewardsEnabled: false,
  pointsPerHour: 60,
  earnMode: 'work',
  appRules: {},
  siteRules: {},
  browserDomains: false,
  driftPromptEnabled: false,
  shareEnabled: false,
  privateApps: [],
  privateDomains: [],
});
const DEFAULT_REWARDS = [
  { id: 'stretch', name: 'Se lever et souffler', minutes: 5, cost: 25 },
  { id: 'game', name: 'Une partie de jeu', minutes: 30, cost: 90 },
  { id: 'movie', name: 'Soirée film', minutes: 120, cost: 240 },
];
function newWallet() {
  return {
    unit: 'work-minutes',
    milestone: 0,
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
    retentionDays: [1, 365],
    maxMB: [100, 10240],
    width: [960, 2560],
    quality: [40, 90],
    musicSeconds: [0, 600],
    volume: [0, 1],
    soundVolume: [0, 1],
    reminderMinutes: [0, 120],
    pointsPerHour: [1, 1000],
  };
  for (const [key, value] of Object.entries(input || {})) {
    if (key === 'privateApps' || key === 'privateDomains') {
      if (
        !Array.isArray(value) ||
        value.length > 200 ||
        value.some((v) => typeof v !== 'string' || !v.trim() || v.length > 100)
      )
        throw Error('Liste privée invalide.');
      s[key] = [...new Set(value.map((v) => v.trim().toLowerCase()))];
      if (key === 'privateDomains' && s[key].some((v) => domainOnly(v) !== v))
        throw Error('Indiquez uniquement les domaines.');
    } else if (key === 'musicSlots') {
      s.musicSlots = validateMusic(value);
    } else if (key === 'spotifyDevice') {
      if (typeof value !== 'string' || value.length > 200)
        throw new Error('Appareil Spotify invalide.');
      s.spotifyDevice = value;
    } else if (key === 'appRules' || key === 'siteRules') {
      if (
        !value ||
        Array.isArray(value) ||
        typeof value !== 'object' ||
        Object.keys(value).length > 200
      )
        throw new Error('Règles invalides');
      s[key] = Object.fromEntries(
        Object.entries(value).map(([app, category]) => {
          if (
            !app.trim() ||
            app.length > 100 ||
            !['work', 'distraction', 'unknown'].includes(category)
          )
            throw new Error('Règle invalide');
          const name = key === 'siteRules' ? domainOnly(app) : app.toLowerCase();
          if (!name || (key === 'siteRules' && name !== app)) throw new Error('Domaine invalide.');
          return [name, category];
        }),
      );
    } else if (key in bounds) {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < bounds[key][0] ||
        value > bounds[key][1]
      )
        throw new Error('Réglage invalide : ' + key);
      s[key] = ['volume', 'soundVolume'].includes(key) ? value : Math.round(value);
    } else if (
      [
        'musicEnabled',
        'soundEnabled',
        'shareEnabled',
        'widget',
        'browserHints',
        'browserDomains',
        'distractionReminder',
        'driftPromptEnabled',
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
      const legacyMusic = !loaded.settings.musicSlots;
      this.data.settings = validateSettings(loaded.settings);
      if (legacyMusic)
        this.data.settings.musicSlots = {
          ...musicSlots,
          intro: { ...musicSlots.intro, enabled: loaded.settings.musicEnabled !== false },
        };
    } catch (e) {
      if (e.code !== 'ENOENT')
        throw new Error(
          'Les données locales sont illisibles. Elles ont été conservées. Fermez FocusReplay et sauvegardez son dossier de données avant réparation.',
        );
    }
    if (!this.data.retentionPolicy) {
      if (this.data.settings.retentionDays === 3) this.data.settings.retentionDays = 90;
      this.data.retentionPolicy = 2;
    }
    this.data.wallet ||= newWallet();
    const wallet = this.data.wallet;
    if (wallet.unit !== 'work-minutes') {
      const factor = 60 / this.data.settings.pointsPerHour;
      wallet.earned *= factor;
      wallet.spent *= factor;
      for (const reward of wallet.rewards)
        reward.cost = Math.max(1, Math.ceil(reward.cost * factor));
      for (const reward of wallet.redemptions)
        reward.cost = Math.max(1, Math.ceil(reward.cost * factor));
      wallet.unit = 'work-minutes';
      wallet.milestone =
        [25, 60, 120, 240, 480].filter((n) => wallet.workMs >= n * 60000).at(-1) || 0;
    }
    this.data.activityDays ||= Object.fromEntries(
      [...new Set(this.data.sessions.flatMap((s) => s.activity.map((a) => dayKey(a.from))))].map(
        (day) => [
          day,
          this.data.sessions
            .flatMap((s) => s.activity)
            .filter((a) => dayKey(a.from) === day && a.category === 'work')
            .reduce((n, a) => n + a.ms, 0),
        ],
      ),
    );
    this.applyRules();
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
  async recordCheckin(prompt, action, text) {
    return this.run(async () => {
      const s = this.active;
      if (
        !s ||
        s.id !== prompt.sessionId ||
        this.systemPaused ||
        (prompt.kind === 'reason' ? s.status !== 'paused' : s.status !== 'recording')
      )
        throw new Error('Ce rappel n’est plus actif.');
      if (
        typeof text !== 'string' ||
        text.length > 500 ||
        !['answer', 'pause', 'dismiss'].includes(action)
      )
        throw new Error('Réponse invalide.');
      if (s.events.some((e) => e.id === prompt.id)) return;
      const at = this.now();
      if (action === 'pause') {
        s.status = 'paused';
        this.data.pauseTimer = {
          name: 'Pause sans limite',
          minutes: null,
          startedAt: at,
          endsAt: null,
          notified: false,
        };
        this.data.wallet.activeBreak = null;
        s.events.push({ at, type: 'pause' });
      }
      s.events.push({
        id: prompt.id,
        at,
        promptedAt: prompt.at,
        type: 'checkin',
        kind: prompt.kind,
        action,
        text: action === 'dismiss' ? '' : text.trim(),
        app: prompt.app,
        domain: prompt.domain,
      });
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
  categoryFor(app, detected = 'unknown', domain = '') {
    if (detected === 'idle') return 'idle';
    if (domain && Object.hasOwn(this.data.settings.siteRules || {}, domain))
      return this.data.settings.siteRules[domain];
    const key = String(app || '').toLowerCase();
    const rules = this.data.settings.appRules || {};
    return Object.hasOwn(rules, key)
      ? rules[key]
      : (siteCategory(domain) ?? classify(app, detected));
  }
  applyRules() {
    const before = {};
    for (const session of this.data.sessions)
      for (const a of session.activity)
        if (a.category === 'work') before[dayKey(a.from)] = (before[dayKey(a.from)] || 0) + a.ms;
    for (const session of this.data.sessions)
      for (const item of [...session.activity, ...session.frames]) {
        item.detectedCategory ??= item.category || 'unknown';
        item.category = this.categoryFor(item.app, item.detectedCategory, item.domain);
      }
    if (this.data.activityDays) {
      const after = {};
      for (const session of this.data.sessions)
        for (const a of session.activity)
          if (a.category === 'work') after[dayKey(a.from)] = (after[dayKey(a.from)] || 0) + a.ms;
      for (const day of new Set([...Object.keys(before), ...Object.keys(after)]))
        this.data.activityDays[day] = Math.max(
          0,
          (this.data.activityDays[day] || 0) + (after[day] || 0) - (before[day] || 0),
        );
    }
  }
  async settings(input) {
    return this.run(async () => {
      this.data.settings = validateSettings(input, this.data.settings);
      this.applyRules();
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
      const detectedCategory =
        typeof activity === 'object' && activity ? activity.category || 'unknown' : 'unknown';
      const domain =
        this.data.settings.browserDomains && this.idle() < 300 ? domainOnly(activity?.domain) : '';
      const category = this.categoryFor(app, detectedCategory, domain);
      if (s && s.status === 'recording' && !this.systemPaused) {
        const name = this.idle() >= 300 ? 'Inactivité (5 min+)' : app;
        if (name && elapsed) {
          const last = s.activity.at(-1);
          const cat = this.idle() >= 300 ? 'idle' : category;
          if (
            last &&
            last.app === name &&
            (last.domain || '') === domain &&
            last.category === cat &&
            Boolean(last.sensitive) === Boolean(activity?.sensitive) &&
            last.detectedCategory === (this.idle() >= 300 ? 'idle' : detectedCategory) &&
            at - last.to < 6000 &&
            dayKey(last.from) === dayKey(at)
          ) {
            last.to = at;
            last.ms += elapsed;
          } else
            s.activity.push({
              app: String(name).slice(0, 100),
              sensitive: Boolean(activity?.sensitive),
              domain,
              category: cat,
              detectedCategory: this.idle() >= 300 ? 'idle' : detectedCategory,
              from: at - elapsed,
              to: at,
              ms: elapsed,
            });
          if (cat === 'work') {
            this.data.activityDays[dayKey(at)] =
              (this.data.activityDays[dayKey(at)] || 0) + elapsed;
          }
          if (
            this.data.settings.rewardsEnabled &&
            !wallet.activeBreak &&
            cat !== 'idle' &&
            (cat === 'work' || this.data.settings.earnMode === 'active')
          ) {
            wallet.earned += elapsed / 60000;
            wallet.workMs += elapsed;
            const milestone =
              [25, 60, 120, 240, 480].filter((n) => wallet.workMs >= n * 60000).at(-1) || 0;
            if (milestone > (wallet.milestone || 0)) {
              wallet.milestone = milestone;
              await this.save();
              this.emit('milestone', { minutes: milestone });
            }
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
              private: Boolean(activity?.sensitive),
              app: name || 'Logiciel non identifié',
              domain,
              category: this.idle() >= 300 ? 'idle' : category,
              detectedCategory: this.idle() >= 300 ? 'idle' : detectedCategory,
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
        throw new Error('Encore un peu de temps de travail avant cette récompense.');
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
