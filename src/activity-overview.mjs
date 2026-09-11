// Overview blocks have true time boundaries. Short switches remain in their breakdown.
export function groupActivity(segments, start, end, width, gaps = []) {
  const span = Math.max(1, end - start);
  const target = Math.max(1, Math.floor(width / 160));
  const count = 2 ** Math.floor(Math.log2(target));
  const step = span / count;
  const result = [];
  const cuts = [
    ...new Set([
      ...Array.from({ length: count + 1 }, (_, i) => start + i * step),
      ...gaps.flatMap((g) => [g.from, g.to]),
    ]),
  ]
    .filter((at) => at >= start && at <= end)
    .sort((a, b) => a - b);
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i],
      to = cuts[i + 1];
    if (gaps.some((g) => from >= g.from && to <= g.to)) continue;
    const totals = new Map();
    for (const a of segments) {
      const overlap = Math.max(0, Math.min(to, a.to) - Math.max(from, a.from));
      if (!overlap) continue;
      const key = a.app + '\0' + (a.domain || '') + '\0' + a.category;
      const row = totals.get(key) || {
        app: a.app,
        domain: a.domain || '',
        category: a.category,
        sharedPrivate: false,
        ms: 0,
      };
      row.ms += overlap * Math.min(1, a.ms / Math.max(1, a.to - a.from));
      row.sharedPrivate ||= Boolean(a.sharedPrivate);
      totals.set(key, row);
    }
    const apps = [...totals.values()].sort((a, b) => b.ms - a.ms);
    if (!apps.length) continue;
    const previous = result.at(-1);
    // Only merge pure adjacent blocks: mixed intervals must not swallow a long focus stretch.
    if (
      previous &&
      previous.to === from &&
      previous.apps.length === 1 &&
      apps.length === 1 &&
      previous.apps[0].app === apps[0].app &&
      previous.apps[0].domain === apps[0].domain &&
      previous.apps[0].category === apps[0].category
    ) {
      previous.to = to;
      previous.apps[0].ms += apps[0].ms;
      previous.apps[0].sharedPrivate ||= apps[0].sharedPrivate;
    } else result.push({ from, to, apps });
  }
  return result;
}

export function sessionGaps(sessions, start, end, now = Date.now()) {
  const active = [],
    pauses = [];
  for (const s of sessions) {
    const finish = Math.min(end, s.endedAt || now);
    if (finish <= start || s.startedAt >= end) continue;
    active.push({ from: Math.max(start, s.startedAt), to: finish });
    let manual = false,
      system = false,
      at = s.startedAt;
    const events = [...(s.events || [])].sort((a, b) => a.at - b.at);
    for (const e of [...events, { at: finish, type: 'end' }]) {
      const to = Math.min(e.at, finish);
      if ((manual || system) && to > at)
        pauses.push({
          from: Math.max(start, at),
          to,
          label: system ? 'Écran verrouillé' : 'Pause',
        });
      at = Math.max(at, to);
      if (e.type === 'pause') manual = true;
      if (e.type === 'resume') manual = false;
      if (e.type === 'system-pause') system = true;
      if (e.type === 'system-resume') system = false;
      if (e.at >= finish) break;
    }
  }
  let at = start;
  for (const a of active.sort((a, b) => a.from - b.from)) {
    if (a.from > at) pauses.push({ from: at, to: a.from, label: 'Hors session' });
    at = Math.max(at, a.to);
  }
  if (at < end) pauses.push({ from: at, to: end, label: 'Hors session' });
  return pauses.filter((a) => a.to > a.from).sort((a, b) => a.from - b.from);
}

export function sessionTime(sessions, start = 0, end = Date.now()) {
  let elapsed = 0,
    paused = 0;
  for (const s of sessions) {
    const from = Math.max(start, s.startedAt),
      to = Math.min(end, s.endedAt || end);
    if (to <= from) continue;
    elapsed += to - from;
    paused += sessionGaps([s], from, to, end).reduce((n, g) => n + g.to - g.from, 0);
  }
  return { active: Math.max(0, elapsed - paused), paused };
}

export function groupMarkers(entries, start, end, width, size = 150) {
  const groups = [];
  for (const e of [...entries]
    .filter((e) => e.at >= start && e.at <= end)
    .sort((a, b) => a.at - b.at)) {
    const x = Math.max(
      0,
      Math.min(width - Math.min(size, width), ((e.at - start) / Math.max(1, end - start)) * width),
    );
    const previous = groups.at(-1);
    if (previous && x < previous.x + size + 8) previous.entries.push(e);
    else groups.push({ x, entries: [e] });
  }
  return groups;
}
