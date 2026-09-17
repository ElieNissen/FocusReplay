import { groupActivity } from './activity-overview.mjs';
// Both renderers use the same time boundaries and dominant-app grouping.
export function replayGroups(
  items: any[],
  from: number,
  to: number,
  zoom: number,
  gaps: any[] = [],
) {
  return groupActivity(
    items.map((a) => ({ ...a, ms: a.ms ?? Math.max(0, a.to - a.from) })),
    from,
    to,
    1200 * zoom,
    gaps,
  ).map((group) => {
    const parts = group.apps.map((a: any) => ({ ...a, app: a.domain || a.app }));
    return {
      ...group,
      parts,
      app: parts[0].app + (parts.length > 1 ? ' +' + (parts.length - 1) : ''),
      category: parts[0].category,
      title: parts
        .map((a: any) => a.app + ' · ' + Math.max(1, Math.round(a.ms / 1000)) + ' s')
        .join('\n'),
    };
  });
}
