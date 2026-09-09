const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { defaults, validateMusic, selection, spotifyUri } = require('../electron/music-config.cjs');
const { MusicDirector } = require('../electron/music-director.cjs');
const { Spotify, REDIRECT } = require('../electron/spotify.cjs');
const track = 'spotify:track:' + 'a'.repeat(22),
  other = 'spotify:track:' + 'b'.repeat(22);
const reply = (value, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(value), { status });
const auth = {
  clientId: 'c'.repeat(32),
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  expiresAt: Date.now() + 3600000,
};
function client(fetcher) {
  const s = new Spotify({ dir: os.tmpdir(), encryption: {}, open: async () => {}, fetcher });
  s.auth = { ...auth };
  return s;
}
test('music links accept only Spotify content; selections shuffle once without duplicates', () => {
  assert.equal(
    spotifyUri('https://open.spotify.com/intl-fr/track/' + 'a'.repeat(22) + '?si=example', 'track'),
    track,
  );
  for (const link of [
    'https://evil.test/track/' + 'a'.repeat(22),
    'file:///secret',
    'spotify:album:' + 'a'.repeat(22),
  ])
    assert.throws(() => spotifyUri(link, 'track'));
  assert.deepEqual(
    selection({ mode: 'selection', links: [track, other, track].join('\n') }, () => 0),
    { uris: [other, track] },
  );
  assert.throws(() => selection({ mode: 'track', links: track + '\n' + other }));
  assert.throws(() => validateMusic({ ...defaults, intro: { ...defaults.intro, enabled: 'yes' } }));
});
test('launch fires once; intro precedes session; repeated recording updates never replay music', async () => {
  const played = [],
    settings = {
      musicSlots: Object.fromEntries(
        Object.keys(defaults).map((k) => [k, { ...defaults[k], enabled: true }]),
      ),
    };
  const director = new MusicDirector({
    settings: () => settings,
    play: async (_, signal, phase) => played.push(phase),
    report: assert.fail,
  });
  director.open();
  await director.queue;
  director.open();
  await director.queue;
  director.observe({ id: 'one', status: 'recording' });
  await director.queue;
  director.observe({ id: 'one', status: 'recording' });
  await director.queue;
  assert.deepEqual(played, ['launch', 'intro', 'session']);
});
test('pausing cancels an intro and its queued soundtrack; resuming does not restart a finished title', async () => {
  const played = [],
    settings = { musicSlots: { ...defaults, session: { ...defaults.session, enabled: true } } };
  const director = new MusicDirector({
    settings: () => settings,
    report: assert.fail,
    play: (_, signal, phase) =>
      new Promise((resolve) => {
        played.push(phase);
        signal.addEventListener('abort', resolve, { once: true });
      }),
  });
  director.open();
  await director.queue;
  director.observe({ id: 'one', status: 'recording' });
  await new Promise(setImmediate);
  director.observe({ id: 'one', status: 'paused' });
  await director.queue;
  director.observe({ id: 'one', status: 'recording' });
  await director.queue;
  assert.deepEqual(played, ['intro']);
});
test('Spotify single track turns repeat off and pauses at the end, without looping', async () => {
  const requests = [];
  const s = client(async (url, options) => {
    requests.push([url, options.method, options.body]);
    if (url.endsWith('/devices')) return reply({ devices: [{ id: 'pc' }] });
    if (url.endsWith('/player'))
      return reply({
        device: { id: 'pc' },
        item: { uri: track, duration_ms: 200000 },
        progress_ms: 199900,
        is_playing: true,
      });
    return reply(null, 204);
  });
  await s.play({ uris: [track] }, new AbortController().signal, 'pc');
  assert.equal(requests.filter(([u]) => u.includes('/play?')).length, 1);
  assert.ok(requests.some(([u]) => u.includes('/repeat?device_id=pc&state=off')));
  assert.ok(requests.some(([u]) => u.includes('/pause?device_id=pc')));
});
test('Spotify never selects another device and respects a manually chosen song', async () => {
  const requests = [];
  const s = client(async (url) => {
    requests.push(url);
    if (url.endsWith('/devices')) return reply({ devices: [{ id: 'pc' }] });
    return reply(null, 204);
  });
  await assert.rejects(
    s.play({ uris: [track] }, new AbortController().signal, 'phone'),
    /appareil/,
  );
  assert.equal(requests.length, 1);
  const controller = new AbortController();
  s.fetcher = async (url) => {
    requests.push(url);
    if (url.endsWith('/devices')) return reply({ devices: [{ id: 'pc' }] });
    if (url.includes('/play?')) controller.abort();
    if (url.endsWith('/player'))
      return reply({ device: { id: 'pc' }, item: { uri: other }, is_playing: true });
    return reply(null, 204);
  };
  await s.play({ uris: [track] }, controller.signal, 'pc');
  assert.ok(!requests.some((u) => u.includes('/pause?')));
});
test('PKCE callback rejects wrong state, stores encrypted credentials, and exposes no tokens', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-oauth-'));
  let authorization;
  const encryption = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(value).map((n) => n ^ 91),
    decryptString: (value) =>
      Buffer.from(value)
        .map((n) => n ^ 91)
        .toString(),
  };
  const s = new Spotify({
    dir,
    encryption,
    open: async (url) => {
      authorization = new URL(url);
      const invalid = await fetch(REDIRECT + '?state=wrong&code=test-code');
      assert.equal(invalid.status, 400);
      await fetch(
        REDIRECT + '?state=' + authorization.searchParams.get('state') + '&code=test-code',
      );
    },
    fetcher: async (url, options) => {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('redirect_uri'), REDIRECT);
      assert.equal(
        createHash('sha256').update(form.get('code_verifier')).digest('base64url'),
        authorization.searchParams.get('code_challenge'),
      );
      assert.equal(form.has('client_secret'), false);
      return reply({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        expires_in: 3600,
      });
    },
  });
  try {
    await s.connect(auth.clientId);
    assert.equal(s.status().connected, true);
    assert.equal(JSON.stringify(s.status()).includes('test-access'), false);
    assert.equal((await fs.readFile(s.file)).includes(Buffer.from('test-refresh')), false);
    await s.disconnect();
    assert.equal(s.status().connected, false);
    await assert.rejects(fs.stat(s.file), { code: 'ENOENT' });
  } finally {
    s.cancelLogin?.();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test('expired credentials refresh once for concurrent requests; rate limits do not retry endlessly', async () => {
  let refreshes = 0;
  const s = client(async (url) => {
    if (url.includes('/api/token')) {
      refreshes++;
      return reply({ access_token: 'new-test-access', expires_in: 3600 });
    }
    return reply({}, 429);
  });
  s.auth.expiresAt = 0;
  s.persist = async () => {};
  await Promise.all([s.access(), s.access()]);
  assert.equal(refreshes, 1);
  assert.equal(s.auth.refresh_token, 'test-refresh');
  await assert.rejects(s.request('/me/player'), /quelques minutes/);
});
