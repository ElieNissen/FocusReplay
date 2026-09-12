import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { storage } from '../standalone/storage.mjs';
import { route } from '../lib/share-api.ts';
import { updateSocialSummary } from '../lib/social-api.ts';
test('social discovery is opt-in; friends grant only their own summaries, never private replay', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-social-')),
    env = await storage(directory);
  t.after(async () => {
    env.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const cookies = {};
  for (const who of ['alice', 'bob', 'charlie']) {
    const token = randomUUID();
    cookies[who] = 'focus_account=' + token;
    await env.DB.prepare('INSERT INTO state(id,value) VALUES (?,?)')
      .bind(
        'owner-session/' + createHash('sha256').update(token).digest('hex'),
        JSON.stringify({ profile: who, expires: Date.now() + 600000 }),
      )
      .run();
  }
  const call = (who, endpoint, body, origin = 'https://example.test') =>
    route(
      new Request('https://example.test' + endpoint, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { origin, ...(who ? { cookie: cookies[who] } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
  const save = (who, publicActivity = false) =>
    call(who, '/api/social/profile', {
      name: who.toUpperCase(),
      discoverable: true,
      publicActivity,
    });
  assert.equal((await call(null, '/api/social')).status, 401);
  for (const who of ['alice', 'bob', 'charlie']) assert.equal((await save(who)).status, 200);
  assert.deepEqual((await (await call(null, '/api/social/discover')).json()).items, []);
  await save('alice', true);
  const snapshot = {
    status: 'recording',
    days: [{ day: '2026-09-11', workMs: 3600000, private: 'secret' }],
    frames: [{ id: 'private-image' }],
    sessions: [{ startedAt: Date.now() - 3600000, workMs: 3600000 }],
    overview: [{ app: 'Editor', to: Date.now() }],
  };
  await updateSocialSummary(env.DB, 'alice', snapshot);
  const publicValue = await (await call(null, '/api/social/discover')).json();
  assert.equal(publicValue.items[0].status, 'recording');
  assert.ok(!JSON.stringify(publicValue).includes('private-image'));
  assert.ok(!JSON.stringify(publicValue).includes('secret'));
  assert.ok(!JSON.stringify(publicValue).includes('Editor'));
  assert.equal(
    (await call('alice', '/api/social/request', { peer: 'bob' }, 'https://evil.test')).status,
    403,
  );
  assert.equal((await call('alice', '/api/social/request', { peer: 'bob' })).status, 200);
  assert.equal((await call('alice', '/api/social/accept', { peer: 'bob' })).status, 409);
  assert.equal((await call('bob', '/api/social/accept', { peer: 'alice' })).status, 200);
  const feed = async (who) => (await (await call(who, '/api/social')).json()).peers;
  assert.equal((await feed('bob'))[0].status, undefined);
  assert.equal(
    (
      await call('charlie', '/api/social/grant', {
        peer: 'alice',
        presence: true,
        stats: true,
        software: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call('alice', '/api/social/grant', {
        peer: 'bob',
        presence: true,
        stats: true,
        software: false,
      })
    ).status,
    200,
  );
  const shared = (await feed('bob'))[0];
  assert.equal(shared.status, 'recording');
  assert.equal(shared.days[0].workMs, 3600000);
  assert.equal(shared.software, undefined);
  assert.equal((await call('bob', '/api/p/alice/snapshot')).status, 401);
  const now = Date.now(),
    past = randomUUID(),
    current = randomUUID();
  const replay = {
    syncedAt: now,
    status: 'recording',
    days: snapshot.days,
    sessions: [
      { id: 'past', startedAt: now - 7200000, endedAt: now - 3600000, workMs: 3600000 },
      { id: 'current', startedAt: now - 1800000, workMs: 1800000 },
    ],
    frames: [
      { id: past, sessionId: 'past', at: now - 4000000, available: true, app: 'Secret app' },
      { id: current, sessionId: 'current', at: now - 600000, available: true, app: 'Editor' },
    ],
    overview: [{ from: now - 7200000, to: now, app: 'Editor' }],
    gaps: [],
  };
  const persist = () =>
    env.DB.prepare(
      'INSERT INTO state(id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
    )
      .bind('alice/snapshot', JSON.stringify(replay))
      .run();
  await persist();
  for (const id of [past, current])
    await env.BUCKET.put('alice/' + id, new Uint8Array([255, 216, 255, 217]));
  const grant = (live, replay, software = false) =>
    call('alice', '/api/social/grant', {
      peer: 'bob',
      presence: true,
      stats: false,
      software,
      live,
      replay,
    });
  await grant(true, false);
  const live = await (await call('bob', '/api/p/alice/snapshot')).json();
  assert.deepEqual(
    live.frames.map((f) => f.id),
    [current],
  );
  assert.equal(live.frames[0].app, '');
  assert.equal(live.sessions[0].workMs, 0);
  assert.deepEqual(live.days, []);
  assert.equal((await call('bob', '/api/p/alice/image/' + past)).status, 404);
  assert.equal((await call('bob', '/api/p/alice/image/' + current)).status, 200);
  await grant(false, true, true);
  const archive = await (await call('bob', '/api/p/alice/snapshot')).json();
  assert.deepEqual(
    archive.frames.map((f) => f.id),
    [past],
  );
  assert.equal(archive.overview[0].to, now - 3600000);
  assert.equal((await call('bob', '/api/p/alice/image/' + current)).status, 404);
  assert.equal((await call(null, '/api/social/preview/alice/' + current)).status, 404);
  await call('alice', '/api/social/profile', {
    name: 'Alice',
    discoverable: true,
    publicActivity: true,
    publicPreview: true,
  });
  assert.equal((await call(null, '/api/social/preview/alice/' + current)).status, 200);
  replay.frames[1].private = true;
  await persist();
  assert.equal((await call(null, '/api/social/preview/alice/' + current)).status, 404);
  await save('alice', true);
  assert.equal((await call(null, '/api/social/preview/alice/' + past)).status, 404);
  await env.DB.prepare('UPDATE social_profiles SET updated=? WHERE profile=?')
    .bind(Date.now() - 910000, 'alice')
    .run();
  assert.equal((await feed('bob'))[0].status, 'offline');
  await call('bob', '/api/social/block', { peer: 'alice', blocked: true });
  assert.equal((await call('bob', '/api/p/alice/image/' + past)).status, 401);
  assert.equal((await feed('alice')).length, 0);
  assert.equal((await call('alice', '/api/social/request', { peer: 'bob' })).status, 404);
  assert.equal((await (await call('alice', '/api/social/search?q=bo')).json()).items.length, 0);
  await call('bob', '/api/social/block', { peer: 'alice', blocked: false });
  assert.equal((await feed('bob')).length, 0);
  await save('alice', false);
  assert.equal((await (await call(null, '/api/social/discover')).json()).items.length, 0);
  assert.equal((await call(null, '/api/social/discover?offset=-1')).status, 400);
});
