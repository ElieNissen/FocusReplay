const test = require('node:test'),
  assert = require('node:assert/strict');
const { buildSnapshot, hidden } = require('../electron/share-snapshot.cjs');
const { Publisher } = require('../electron/publisher.cjs');
const fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const now = Date.now(),
  at = now - 120000;
function data() {
  return {
    settings: { shareEnabled: true, privateApps: [], privateDomains: [] },
    sessions: [
      {
        id: 's',
        startedAt: at - 60000,
        frames: [{ id: 'frame', at, app: 'Editor', category: 'work', camera: true, cameraAt: at }],
        activity: [],
        events: [{ type: 'checkin', at, text: 'secret answer' }],
        status: 'recording',
      },
    ],
    activityDays: { '2026-09-01': 60000 },
    localAudio: { secret: 'path' },
    spotifyToken: 'secret token',
  };
}
test('shared manifest excludes camera, answers and credentials, applies delay and adjacent sensitive masking', () => {
  const d = data();
  d.sessions[0].frames.push({ id: 'recent', at: now, app: 'Editor' });
  let s = buildSnapshot(d, at - 60000, now);
  assert.equal(s.frames.length, 1);
  assert.equal(JSON.stringify(s).includes('secret'), false);
  assert.equal(JSON.stringify(s).includes('camera'), false);
  d.sessions[0].activity.push({
    from: at + 5000,
    to: at + 7000,
    app: 'Password manager',
    sensitive: true,
  });
  s = buildSnapshot(d, at - 60000, now);
  assert.equal(s.frames[0].private, true);
  assert.equal(s.frames[0].app, 'Données privées');
  assert.equal(hidden({ app: 'Brave' }, { privateDomains: ['mail.example'] }), true);
  assert.equal(
    hidden({ app: 'Brave', domain: 'sub.mail.example' }, { privateDomains: ['mail.example'] }),
    true,
  );
  assert.equal(
    hidden({ app: 'Brave', domain: 'mail.example.evil' }, { privateDomains: ['mail.example'] }),
    false,
  );
  assert.equal(buildSnapshot(d, now, now).frames.length, 0);
});
test('publisher waits for uploads before clearing and never publishes another manifest after stop', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-share-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'frame'), 'image');
  const d = data(),
    calls = [];
  let release, started;
  const uploading = new Promise((r) => (started = r));
  const p = new Publisher({
    recorder: { dir, data: d, snapshot: () => d, framePath: () => path.join(dir, 'frame') },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(s) },
    nativeImage: {
      createFromBuffer: () => ({
        resize() {
          return this;
        },
        toJPEG: () => Buffer.from([255, 216]),
      }),
    },
    fetcher: async (url, opts) => {
      calls.push([url, opts.method]);
      if (url.includes('/image/')) {
        started();
        await new Promise((r) => (release = r));
      }
      return new Response('{}');
    },
  });
  p.auth = {
    url: 'https://example.test',
    profile: 'alice',
    key: 'a'.repeat(64),
    since: at - 60000,
    configured: true,
  };
  const pending = p.sync();
  await uploading;
  d.settings.shareEnabled = false;
  const clearing = p.clear();
  release();
  await Promise.all([pending, clearing]);
  assert.equal(calls.at(-1)[1], 'DELETE');
  assert.equal(calls.filter((c) => c[1] === 'PUT' && c[0].endsWith('/snapshot')).length, 1);
  assert.equal(JSON.stringify(p.state()).includes('aaaa'), false);
});
test('adaptive history covers 90 days with a strict 800-image budget and re-masks archives', () => {
  const { selectHistory, mergeHistory } = require('../electron/share-history.cjs');
  const frames = Array.from({ length: 90 * 480 }, (_, i) => ({
    id: String(i),
    at: now - 60001 - i * 180000,
    app: 'Editor',
    available: true,
  }));
  const selected = selectHistory(frames, now);
  assert.ok(selected.length <= 800);
  assert.ok(selected.some((f) => f.at < now - 80 * 86400000));
  assert.ok(selected.some((f) => f.at > now - 3600000));
  const merged = mergeHistory(
    {
      frames: [{ id: 'old', at: now - 60 * 86400000, app: 'SecretApp', available: true }],
      sessions: [],
    },
    { frames: [], sessions: [], days: [] },
    { privateApps: ['secretapp'] },
    now,
  );
  assert.equal(merged.frames[0].private, true);
  assert.equal(merged.frames[0].available, false);
  assert.equal(merged.frames[0].app, 'Données privées');
});
test('failed online removal survives restart and clears its warning after a successful retry', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-share-removal-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const d = data();
  d.settings.shareEnabled = false;
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: (b) => b.toString(),
  };
  const recorder = { dir, data: d };
  const p = new Publisher({
    recorder,
    safeStorage: storage,
    fetcher: async () => new Response('', { status: 503 }),
  });
  p.auth = { url: 'https://example.test', profile: 'alice', key: 'a'.repeat(64), configured: true };
  await assert.rejects(p.clear());
  assert.equal(p.auth.pendingClear, true);
  let calls = 0;
  const r = new Publisher({
    recorder,
    safeStorage: storage,
    fetcher: async (url, options) => {
      calls++;
      assert.equal(options.method, 'DELETE');
      return new Response('{}');
    },
  });
  await r.init();
  r.error = 'Connection failed';
  await r.sync();
  assert.equal(calls, 1);
  assert.equal(r.state().pendingRemoval, false);
  assert.equal(r.state().error, '');
});
test('local privacy indicators agree with online masking including adjacent captures', () => {
  const { localPrivacy, hidden } = require('../electron/share-snapshot.cjs');
  const settings = { privateApps: ['notion'], privateDomains: ['private.example'] };
  const frames = [5, 20, 40, 80].map((at) => ({ id: String(at), at: at * 1000, app: 'Editor' }));
  const activity = [{ from: 30000, to: 50000, app: 'Brave', domain: 'sub.private.example' }];
  const data = { settings, sessions: [{ frames, activity }] };
  const result = localPrivacy(data);
  assert.deepEqual(
    result.sessions[0].frames.map((f) => f.sharedPrivate),
    [false, true, true, false],
  );
  assert.equal(result.sessions[0].activity[0].sharedPrivate, true);
  assert.equal(hidden({ app: 'Notion' }, settings), true);
  assert.equal(data.sessions[0].frames[0].sharedPrivate, undefined);
});
