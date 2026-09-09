const { test } = require('node:test');
const assert = require('node:assert/strict');
test('day overview groups rapid switches without losing time or changing proportional boundaries', async () => {
  const { groupActivity } = await import('../src/activity-overview.mjs');
  const segments = Array.from({ length: 14400 }, (_, i) => ({
    from: i * 2000,
    to: (i + 1) * 2000,
    ms: 2000,
    app: i % 10 === 0 ? 'Explorer' : 'Editor',
    category: 'work',
  }));
  const groups = groupActivity(segments, 0, 28800000, 1280);
  assert.ok(groups.length <= 8);
  assert.equal(
    groups.reduce((sum, g) => sum + g.apps.reduce((n, a) => n + a.ms, 0), 0),
    28800000,
  );
  assert.ok(groups.every((g) => g.apps[0].app === 'Editor' && g.apps.length === 2));
  assert.ok(groups.every((g, i) => g.from === i * 3600000 && g.to === (i + 1) * 3600000));
  assert.ok(groupActivity(segments, 0, 28800000, 10240).length <= 64);
});
test('pauses, locking and inter-session gaps are explicit; grouping never bridges them', async () => {
  const { groupActivity, sessionGaps } = await import('../src/activity-overview.mjs');
  const sessions = [
    {
      startedAt: 0,
      endedAt: 100,
      events: [
        { at: 20, type: 'pause' },
        { at: 30, type: 'system-pause' },
        { at: 40, type: 'system-resume' },
        { at: 60, type: 'resume' },
      ],
    },
    { startedAt: 150, endedAt: 200, events: [] },
  ];
  const gaps = sessionGaps(sessions, 0, 200);
  assert.deepEqual(gaps, [
    { from: 20, to: 30, label: 'Pause' },
    { from: 30, to: 40, label: 'Écran verrouillé' },
    { from: 40, to: 60, label: 'Pause' },
    { from: 100, to: 150, label: 'Hors session' },
  ]);
  const groups = groupActivity(
    [{ from: 0, to: 200, ms: 200, app: 'Editor', category: 'work' }],
    0,
    200,
    1000,
    gaps,
  );
  assert.ok(groups.every((g) => !gaps.some((p) => g.from < p.to && g.to > p.from)));
});
