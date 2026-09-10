const { hidden } = require('./share-snapshot.cjs');
const DAY = 86400000;
function sample(frames, count) {
  if (frames.length <= count) return frames;
  return Array.from(
    { length: count },
    (_, i) => frames[Math.floor((i * (frames.length - 1)) / (count - 1))],
  );
}
function selectHistory(frames, now = Date.now()) {
  const sorted = [...new Map(frames.map((f) => [f.id, f])).values()]
    .filter((f) => f.at <= now - 60000 && f.at >= now - 90 * DAY)
    .sort((a, b) => a.at - b.at);
  const tiers = [
    [0, 1, 400],
    [1, 7, 200],
    [7, 30, 140],
    [30, 90, 60],
  ];
  return tiers
    .flatMap(([from, to, count]) =>
      sample(
        sorted.filter((f) => f.at < now - from * DAY && f.at >= now - to * DAY),
        count,
      ),
    )
    .sort((a, b) => a.at - b.at);
}
function mergeHistory(previous, current, settings, now = Date.now()) {
  const merge = (old, next, key) => [
    ...new Map([...(old || []), ...(next || [])].map((x) => [x[key], x])).values(),
  ];
  const frames = selectHistory(
    merge(
      (previous?.frames || []).filter((f) => f.available || f.private),
      current.frames,
      'id',
    ),
    now,
  ).map((f) =>
    hidden(f, settings)
      ? {
          ...f,
          private: true,
          app: 'Données privées',
          domain: '',
          category: 'unknown',
          available: false,
        }
      : f,
  );
  const sessions = merge(previous?.sessions, current.sessions, 'id')
    .filter((s) => (s.endedAt || now) >= now - 90 * DAY)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-500);
  return {
    ...current,
    frames,
    sessions,
    days: merge(previous?.days, current.days, 'day'),
    gaps: merge(previous?.gaps, current.gaps, 'from')
      .filter((g) => g.to >= now - 90 * DAY)
      .slice(-5000),
    overview: merge(previous?.overview, current.overview, 'from')
      .filter((a) => a.to >= now - 7 * DAY)
      .map((a) =>
        hidden(a, settings) ? { ...a, app: 'Données privées', category: 'unknown', workMs: 0 } : a,
      ),
    retention: { days: 90, maxImages: 800, adaptive: true },
  };
}
module.exports = { selectHistory, mergeHistory };
