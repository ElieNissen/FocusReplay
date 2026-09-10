const { dayKey } = require('./core.cjs');
const browser = /brave|chrome|edge|firefox|opera/i;
const secretApp = /1password|bitwarden|keepass|lastpass|dashlane|credential/i;
function hidden(value, settings) {
  const app = (value.app || '').toLowerCase(),
    domain = (value.domain || '').toLowerCase();
  return Boolean(
    value.private ||
    value.sensitive ||
    secretApp.test(app) ||
    (settings.privateApps || []).includes(app) ||
    (settings.privateDomains || []).some((d) => domain === d || domain.endsWith('.' + d)) ||
    ((settings.privateDomains || []).length && browser.test(app) && !domain),
  );
}
function buildSnapshot(data, since, now = Date.now()) {
  const cutoff = Math.max(since, now - 3 * 86400000),
    until = now - 60000;
  const sessions = data.sessions.filter((s) => (s.endedAt || now) >= cutoff).slice(-12);
  const frames = sessions
    .flatMap((s) => s.frames.map((f) => ({ ...f, sessionId: s.id })))
    .filter((f) => f.at >= cutoff && f.at <= until)
    .sort((a, b) => a.at - b.at)
    .slice(-800);
  const activity = sessions.flatMap((s) => s.activity);
  const buckets = new Map();
  for (const a of activity) {
    const from = Math.max(cutoff, a.from),
      to = Math.min(until, a.to);
    for (let t = from; t < to;) {
      const slot = Math.floor(t / 300000) * 300000,
        end = Math.min(to, slot + 300000);
      const privateItem = hidden(a, data.settings);
      const app = privateItem ? 'Données privées' : a.app;
      const category = privateItem ? 'unknown' : a.category;
      const key = app + '|' + category;
      if (!buckets.has(slot)) buckets.set(slot, new Map());
      const apps = buckets.get(slot);
      const previous = apps.get(key) || { app, category, ms: 0, from: t, to: end };
      previous.ms += end - t;
      previous.to = end;
      apps.set(key, previous);
      t = end;
    }
  }
  const overview = [...buckets]
    .sort(([a], [b]) => a - b)
    .map(([slot, apps]) => {
      const all = [...apps.values()],
        dominant = all.sort((a, b) => b.ms - a.ms)[0];
      return {
        from: Math.max(cutoff, slot),
        to: Math.min(until, slot + 300000),
        app: dominant.app,
        category: dominant.category,
        workMs: all.filter((a) => a.category === 'work').reduce((n, a) => n + a.ms, 0),
      };
    });
  const publicFrames = frames.map((f) => {
    const privateFrame =
      hidden(f, data.settings) ||
      activity.some(
        (a) => a.from <= f.at + 10000 && a.to >= f.at - 10000 && hidden(a, data.settings),
      );
    return {
      id: f.id,
      at: f.at,
      day: dayKey(f.at),
      sessionId: f.sessionId,
      private: privateFrame,
      app: privateFrame ? 'Données privées' : f.app,
      domain: privateFrame ? '' : f.domain || '',
      category: privateFrame ? 'unknown' : f.category,
    };
  });
  const gaps = [];
  for (const s of sessions) {
    let paused = false,
      system = false,
      at = s.startedAt;
    for (const e of [...s.events, { at: s.endedAt || now, type: 'end' }].sort(
      (a, b) => a.at - b.at,
    )) {
      if ((paused || system) && e.at > at) gaps.push({ from: at, to: e.at, label: 'Pause' });
      if (e.type === 'pause') paused = true;
      if (e.type === 'resume') paused = false;
      if (e.type === 'system-pause') system = true;
      if (e.type === 'system-resume') system = false;
      at = e.at;
    }
  }
  for (let i = 1; i < sessions.length; i++)
    if (sessions[i - 1].endedAt < sessions[i].startedAt)
      gaps.push({
        from: sessions[i - 1].endedAt,
        to: sessions[i].startedAt,
        label: 'Hors session',
      });
  const current = sessions.find((s) => !s.endedAt);
  return {
    frames: publicFrames,
    overview,
    gaps,
    status: current
      ? data.systemPaused || current.status === 'paused'
        ? 'paused'
        : 'recording'
      : 'offline',
    sessions: sessions.map((s) => ({
      id: s.id,
      day: dayKey(s.startedAt),
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      status: s.endedAt ? 'ended' : data.systemPaused ? 'paused' : s.status,
      workMs: s.activity.filter((a) => a.category === 'work').reduce((n, a) => n + a.ms, 0),
    })),
    days: Object.entries(data.activityDays || {}).map(([day, workMs]) => ({ day, workMs })),
  };
}
module.exports = { hidden, buildSnapshot };
