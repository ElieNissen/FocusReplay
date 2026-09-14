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
  const overview = [];
  for (const a of [...activity].sort((a, b) => a.from - b.from)) {
    const from = Math.max(cutoff, a.from),
      to = Math.min(until, a.to);
    if (to <= from) continue;
    const masked = hidden(a, data.settings);
    const item = {
      from,
      to,
      app: masked ? 'Données privées' : a.app,
      domain: masked ? '' : a.domain || '',
      category: masked ? 'unknown' : a.category,
      workMs: !masked && a.category === 'work' ? to - from : 0,
    };
    const last = overview.at(-1);
    if (
      last &&
      last.to === from &&
      last.app === item.app &&
      last.domain === item.domain &&
      last.category === item.category
    ) {
      last.to = to;
      last.workMs += item.workMs;
    } else overview.push(item);
  }
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
function localPrivacy(data) {
  const settings = data.settings;
  const intervals = data.sessions
    .flatMap((s) => s.activity)
    .filter((a) => hidden(a, settings))
    .map((a) => ({ from: a.from - 10000, to: a.to + 10000 }))
    .sort((a, b) => a.from - b.from);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval.from <= last.to) last.to = Math.max(last.to, interval.to);
    else merged.push({ ...interval });
  }
  const nearPrivate = (at) => {
    let lo = 0,
      hi = merged.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1,
        a = merged[mid];
      if (at < a.from) hi = mid - 1;
      else if (at > a.to) lo = mid + 1;
      else return true;
    }
    return false;
  };
  return {
    ...data,
    sessions: data.sessions.map((s) => ({
      ...s,
      frames: s.frames.map((f) => ({
        ...f,
        sharedPrivate: hidden(f, settings) || nearPrivate(f.at),
        privacyReasons: [
          f.private && 'Capture masquée manuellement',
          (f.sensitive || secretApp.test(f.app || '')) && 'Contenu sensible détecté',
          (settings.privateApps || []).includes((f.app || '').toLowerCase()) && 'Logiciel masqué',
          (settings.privateDomains || []).some(
            (d) =>
              (f.domain || '').toLowerCase() === d ||
              (f.domain || '').toLowerCase().endsWith('.' + d),
          ) && 'Site masqué',
          (settings.privateDomains || []).length > 0 &&
            browser.test(f.app || '') &&
            !f.domain &&
            'Domaine inconnu dans un navigateur',
          nearPrivate(f.at) && 'Proche d’une activité masquée (10 s)',
        ].filter(Boolean),
      })),
      activity: s.activity.map((a) => ({ ...a, sharedPrivate: hidden(a, settings) })),
    })),
  };
}
module.exports = { hidden, buildSnapshot, localPrivacy };
