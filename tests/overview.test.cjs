const { test } = require('node:test');
const assert = require('node:assert/strict');
test('active session duration excludes overlapping manual and system pauses and clips days', async () => {
  const { sessionTime, groupMarkers } = await import('../src/activity-overview.mjs');
  const s = {
    startedAt: 100,
    endedAt: 900,
    events: [
      { at: 200, type: 'pause' },
      { at: 250, type: 'system-pause' },
      { at: 300, type: 'resume' },
      { at: 400, type: 'system-resume' },
    ],
  };
  assert.deepEqual(sessionTime([s], 0, 1000), { active: 600, paused: 200 });
  assert.deepEqual(sessionTime([s], 275, 500), { active: 100, paused: 125 });
  assert.deepEqual(
    sessionTime([{ ...s, endedAt: null, events: [{ at: 200, type: 'pause' }] }], 0, 800),
    { active: 100, paused: 600 },
  );
  const entries = [100, 101, 102, 500, 999].map((at, i) => ({ at, id: String(i) }));
  for (const width of [300, 900, 7200]) {
    const groups = groupMarkers(entries, 0, 1000, width);
    assert.equal(groups.flatMap((g) => g.entries).length, 5);
    assert.ok(groups.every((g, i) => !i || g.x >= groups[i - 1].x + 158));
  }
});
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
