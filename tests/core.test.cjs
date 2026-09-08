const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Recorder, validateSettings, selectFrames, dayKey } = require('../electron/core.cjs');
const { classify } = require('../electron/tracker.cjs');
const { makeSubtitles, safeText } = require('../electron/export.cjs');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'focusreplay-unit-'));
  let at = Date.now(),
    shots = 0;
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const r = new Recorder({
    dir,
    now: () => at,
    capture: async () => {
      shots++;
      return { bytes: Buffer.from('fake-jpeg'), display: 'Test', width: 1280, height: 720 };
    },
    activity: () => ({ app: 'Editor', category: 'work' }),
  });
  await r.init();
  return {
    r,
    dir,
    advance: (ms) => {
      at += ms;
    },
    shots: () => shots,
  };
}
test('one-click capture, paused sessions and system lock never produce captures', async (t) => {
  const f = await fixture(t);
  await f.r.start();
  await f.r.tick();
  assert.equal(f.shots(), 1);
  await assert.rejects(() => f.r.start(), /déjà/);
  await f.r.pause();
  f.advance(65000);
  await f.r.tick();
  assert.equal(f.shots(), 1);
  await f.r.systemPause(true);
  await f.r.pause();
  f.advance(65000);
  await f.r.tick();
  assert.equal(f.shots(), 1);
  await f.r.systemPause(false);
  await f.r.tick();
  assert.equal(f.shots(), 2);
  await f.r.stop();
  f.advance(65000);
  await f.r.tick();
  assert.equal(f.shots(), 2);
});
test('system unlock preserves a manual pause', async (t) => {
  const { r } = await fixture(t);
  await r.start();
  await r.pause();
  await r.systemPause(true);
  await r.systemPause(false);
  assert.equal(r.active.status, 'paused');
});
test('foreground time does not count long sleeps as work', async (t) => {
  const f = await fixture(t);
  await f.r.start();
  f.advance(2000);
  await f.r.tick();
  f.advance(3600000);
  await f.r.tick();
  assert.equal(
    f.r.active.activity.reduce((n, a) => n + a.ms, 0),
    7000,
  );
});
test('recovery ends interrupted sessions without restarting surveillance', async (t) => {
  const { r, dir } = await fixture(t);
  await r.start();
  await r.tick();
  const restored = new Recorder({ dir });
  await restored.init();
  assert.equal(restored.active, undefined);
  assert.equal(restored.data.sessions[0].status, 'interrupted');
  assert.equal(restored.data.sessions[0].frames.length, 1);
});
test('retention protects exports, then removes expired captures and activity', async (t) => {
  const f = await fixture(t);
  await f.r.start();
  await f.r.tick();
  await f.r.stop();
  const id = f.r.data.sessions[0].frames[0].id;
  f.r.pins.add(id);
  f.advance(4 * 86400000);
  await f.r.clean();
  assert.equal(f.r.hasFrame(id), true);
  f.r.pins.delete(id);
  await f.r.clean();
  assert.equal(f.r.hasFrame(id), false);
  await assert.rejects(fs.access(f.r.framePath(id)));
  assert.equal(f.r.data.sessions.length, 0);
});
test('storage quota deletes oldest captures, not the newest', async (t) => {
  const f = await fixture(t);
  await f.r.start();
  await f.r.tick();
  const old = f.r.active.frames[0];
  old.bytes = 110 * 1024 * 1024;
  f.advance(65000);
  await f.r.tick();
  await f.r.settings({ maxMB: 100 });
  assert.equal(f.r.hasFrame(old.id), false);
  assert.equal(f.r.active.frames.length, 1);
});
test('session deletion blocked while active or pinned; scoped deletion removes all metadata', async (t) => {
  const { r } = await fixture(t);
  const id = await r.start();
  await r.tick();
  await assert.rejects(() => r.deleteSession(id), /Terminez/);
  await r.stop();
  const frame = r.data.sessions[0].frames[0];
  r.pins.add(frame.id);
  await assert.rejects(() => r.deleteSession(id), /export/);
  r.pins.clear();
  await r.deleteSession(id);
  assert.equal(r.data.sessions.length, 0);
});
test('corrupt state is preserved and never silently replaced', async (t) => {
  const { dir } = await fixture(t);
  await fs.writeFile(path.join(dir, 'state.json'), '{broken');
  const r = new Recorder({ dir });
  await assert.rejects(() => r.init(), /conservées/);
  assert.equal(await fs.readFile(path.join(dir, 'state.json'), 'utf8'), '{broken');
});
test('capture failures are recorded as gaps and recover on the next interval', async (t) => {
  const f = await fixture(t);
  const capture = f.r.capture;
  f.r.capture = async () => {
    throw new Error('Disconnected');
  };
  await f.r.start();
  await f.r.tick();
  assert.match(f.r.warning, /Disconnected/);
  assert.equal(f.r.active.events.at(-1).type, 'capture-error');
  f.r.capture = capture;
  f.advance(65000);
  await f.r.tick();
  assert.equal(f.r.active.frames.length, 1);
  assert.equal(f.r.warning, '');
});
test('settings reject unsafe values and paths cannot escape capture directory', async (t) => {
  const { r } = await fixture(t);
  assert.throws(() => validateSettings({ interval: NaN }));
  assert.throws(() => validateSettings({ theme: 'bad' }));
  assert.throws(() => validateSettings({ browserHints: 'true' }));
  assert.throws(() => r.framePath('../../secret'));
  assert.equal(validateSettings({ arbitrary: '/secret' }).arbitrary, undefined);
});
test('day and range export uses capture dates, including sessions crossing midnight', () => {
  const a = new Date(2026, 0, 1, 23, 59).getTime(),
    b = a + 120000;
  const sessions = [{ id: 's', startedAt: a, events: [], frames: [{ at: a }, { at: b }] }];
  assert.equal(selectFrames(sessions, { day: dayKey(b) }).length, 1);
  assert.equal(selectFrames(sessions, { from: b, to: b })[0].at, b);
});
test('classification remains cautious and raw titles never appear in output', () => {
  assert.equal(classify('Code'), 'work');
  assert.equal(classify('chrome'), 'unknown');
  assert.equal(classify('Discord'), 'unknown');
  assert.equal(classify('Spotify'), 'unknown');
  assert.equal(classify('steam'), 'distraction');
  assert.equal(classify('chrome', 'distraction'), 'distraction');
  assert.equal(classify('chrome', 'YouTube video title'), 'unknown');
});
test('subtitle labels escape ASS commands and include exact timestamps and interruptions', () => {
  assert.equal(safeText('{\\pos(0,0)}\n'), '  pos(0,0)  ');
  const text = makeSubtitles(
    [
      { at: 1000000, app: '{\\b1}Editor', sessionId: 'a' },
      { at: 1200000, app: 'Browser', sessionId: 'b' },
    ],
    4,
  );
  assert.match(text, /0:00:00.25/);
  assert.match(text, /Après une interruption/);
  assert.doesNotMatch(text, /\\b1/);
});
test('timeline lookup holds last known frame and clamps edges', async () => {
  const { frameAt, summarize } = await import('../src/lib.mjs');
  const f = [{ at: 100 }, { at: 200 }, { at: 300 }];
  assert.equal(frameAt(f, 250), f[1]);
  assert.equal(frameAt(f, 0), f[0]);
  assert.equal(frameAt(f, 999), f[2]);
  assert.equal(frameAt([], 9), null);
  const s = summarize([
    { app: 'Editor', ms: 100, category: 'work' },
    { app: 'Editor', ms: 50, category: 'unknown' },
  ]);
  assert.equal(s.apps.length, 1);
  assert.equal(s.total, 150);
});
test('camera is off by default; paired files count toward quota and delete together', async (t) => {
  const f = await fixture(t);
  assert.equal(f.r.data.settings.cameraEnabled, false);
  f.r.capture = async () => ({
    bytes: Buffer.from('screen'),
    camera: { bytes: Buffer.from('camera'), at: Date.now() },
    display: 'Test',
    width: 100,
    height: 100,
  });
  await f.r.start();
  await f.r.tick();
  const frame = f.r.active.frames[0];
  assert.equal(frame.bytes, 12);
  assert.equal(frame.camera, true);
  await fs.access(f.r.cameraPath(frame.id));
  await f.r.deleteFrame(frame.id);
  await assert.rejects(fs.access(f.r.cameraPath(frame.id)));
  await assert.rejects(fs.access(f.r.framePath(frame.id)));
});
test('camera failure does not prevent a screen capture', async (t) => {
  const { r } = await fixture(t);
  r.capture = async () => ({
    bytes: Buffer.from('screen'),
    cameraWarning: 'Camera unavailable',
    display: 'Test',
    width: 100,
    height: 100,
  });
  await r.start();
  await r.tick();
  assert.equal(r.active.frames.length, 1);
  assert.equal(r.active.frames[0].camera, false);
  assert.equal(r.snapshot().cameraWarning, 'Camera unavailable');
});
test('reward accrual is opt-in, uses observed work, and survives retention', async (t) => {
  const f = await fixture(t);
  await f.r.start();
  f.advance(2000);
  await f.r.tick();
  assert.equal(f.r.data.wallet.earned, 0);
  await f.r.settings({ rewardsEnabled: true, pointsPerHour: 60 });
  f.advance(2000);
  await f.r.tick();
  assert.ok(Math.abs(f.r.data.wallet.earned - 1 / 30) < 1e-8);
  f.r.activity = () => ({ app: 'Browser', category: 'unknown' });
  f.advance(2000);
  await f.r.tick();
  assert.ok(Math.abs(f.r.data.wallet.earned - 1 / 30) < 1e-8);
  await f.r.pause();
  f.advance(2000);
  await f.r.tick();
  assert.ok(Math.abs(f.r.data.wallet.earned - 1 / 30) < 1e-8);
  await f.r.stop();
  const points = f.r.data.wallet.earned;
  f.advance(4 * 86400000);
  await f.r.clean();
  assert.equal(f.r.data.wallet.earned, points);
});
test('reward redemption is serialized, pauses capture, prevents double spending and persists', async (t) => {
  const f = await fixture(t);
  await f.r.settings({ rewardsEnabled: true });
  f.r.data.wallet.earned = 30;
  await f.r.start();
  const results = await Promise.allSettled([
    f.r.redeemReward('stretch'),
    f.r.redeemReward('stretch'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(f.r.data.wallet.spent, 25);
  assert.equal(f.r.active.status, 'paused');
  let notified = 0;
  f.r.on('break-ended', () => notified++);
  f.advance(6 * 60000);
  await f.r.tick();
  await f.r.tick();
  assert.equal(notified, 1);
  assert.equal(f.r.active.status, 'paused');
  await f.r.finishBreak();
  assert.equal(f.r.data.wallet.activeBreak, null);
  assert.equal(f.r.data.wallet.spent, 25);
  const loaded = new Recorder({ dir: f.dir });
  await loaded.init();
  assert.equal(loaded.data.wallet.spent, 25);
});
test('custom rewards validate names and amounts, with no retroactive rate conversion', async (t) => {
  const { r } = await fixture(t);
  await r.saveReward({ name: 'Walk', minutes: 15, cost: 10 });
  assert.equal(r.data.wallet.rewards.at(-1).name, 'Walk');
  await assert.rejects(() => r.saveReward({ name: '', minutes: -1, cost: NaN }));
  r.data.wallet.earned = 50;
  await r.settings({ pointsPerHour: 120 });
  assert.equal(r.data.wallet.earned, 50);
});
test('timed pauses notify once, never resume automatically, and stop cancels the timer', async (t) => {
  const f = await fixture(t);
  await f.r.start();
  await f.r.tick();
  let notifications = 0;
  f.r.on('break-ended', () => notifications++);
  await f.r.pauseFor(2);
  f.advance(121000);
  await f.r.tick();
  await f.r.tick();
  assert.equal(notifications, 1);
  assert.equal(f.shots(), 1);
  assert.equal(f.r.active.status, 'paused');
  await f.r.pause();
  assert.equal(f.r.data.pauseTimer, null);
  assert.equal(f.r.active.status, 'recording');
  await f.r.pauseFor(5);
  await f.r.stop();
  f.advance(360000);
  await f.r.tick();
  assert.equal(notifications, 1);
  assert.equal(f.r.data.pauseTimer, null);
});
test('indefinite pauses have no alarm and invalid durations are rejected', async (t) => {
  const f = await fixture(t);
  await f.r.start();
  await assert.rejects(() => f.r.pauseFor(0));
  await assert.rejects(() => f.r.pauseFor(1.5));
  await f.r.pauseFor(null);
  let n = 0;
  f.r.on('break-ended', () => n++);
  f.advance(86400000);
  await f.r.tick();
  assert.equal(n, 0);
  assert.equal(f.r.data.pauseTimer.endsAt, null);
  assert.equal(f.r.active.status, 'paused');
});
