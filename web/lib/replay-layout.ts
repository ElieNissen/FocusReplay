// Group only for display. Exact activity times remain in the shared manifest.
export function replayGroups(items: any[], from: number, to: number, zoom: number) {
  const step = Math.max(1000, (to - from) / Math.max(6, Math.round(10 * zoom)));
  const result = [];
  for (let start = from; start < to; start += step) {
    const end = Math.min(to, start + step),
      apps = new Map<string, any>();
    for (const a of items) {
      const ms = Math.min(end, a.to) - Math.max(start, a.from);
      if (ms <= 0) continue;
      const key = a.domain || a.app;
      const old = apps.get(key) || { app: key, ms: 0, category: a.category };
      old.ms += ms;
      apps.set(key, old);
    }
    if (!apps.size) continue;
    const parts = [...apps.values()].sort((a, b) => b.ms - a.ms);
    result.push({
      from: start,
      to: end,
      app: parts[0].app + (parts.length > 1 ? ' +' + (parts.length - 1) : ''),
      category: parts[0].category,
      title: parts.map((a) => `${a.app} · ${Math.max(1, Math.round(a.ms / 1000))} s`).join('\n'),
    });
  }
  return result;
}
