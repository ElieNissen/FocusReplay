export const labels = {
  work: 'Travail probable',
  distraction: 'Distraction probable',
  unknown: 'Indéterminé',
  idle: 'Inactivité',
};
export const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const time = (ms) =>
  new Date(ms).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
export const shortTime = (ms) =>
  new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export function duration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} h ${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}`;
}
export function frameAt(frames, at) {
  if (!frames.length) return null;
  let lo = 0,
    hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].at <= at) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}
export function summarize(segments) {
  const apps = new Map(),
    categories = { work: 0, distraction: 0, unknown: 0, idle: 0 };
  for (const a of segments) {
    const cat = a.category in categories ? a.category : 'unknown';
    categories[cat] += a.ms;
    const row = apps.get(a.app) || {
      name: a.app,
      ms: 0,
      categories: { work: 0, distraction: 0, unknown: 0, idle: 0 },
    };
    row.ms += a.ms;
    row.categories[cat] += a.ms;
    apps.set(a.app, row);
  }
  return {
    apps: [...apps.values()].sort((a, b) => b.ms - a.ms),
    categories,
    total: Object.values(categories).reduce((a, b) => a + b, 0),
  };
}
export function mergeSegments(segments) {
  const result = [];
  for (const a of [...segments].sort((a, b) => a.from - b.from)) {
    const previous = result.at(-1);
    if (
      previous &&
      previous.app === a.app &&
      previous.category === a.category &&
      a.from - previous.to < 5000
    ) {
      previous.to = a.to;
      previous.ms += a.ms;
    } else result.push({ ...a });
  }
  return result;
}
