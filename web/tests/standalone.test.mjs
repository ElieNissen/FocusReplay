import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { storage } from '../standalone/storage.mjs';
import { route } from '../lib/share-api.ts';
test('independent instance generates its secrets, registers an account, keeps it across restarts and isolates viewer access', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-independent-'));
  let s = await storage(dir);
  t.after(async () => {
    s.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const call = (url, method = 'GET', body, headers = {}) =>
    route(
      new Request('https://example.test' + url, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      s,
    );
  const body = {
    profile: 'alice',
    password: 'An independent account password',
    invitation: s.invitation,
  };
  assert.equal(
    (await call('/api/account/register', 'POST', { ...body, invitation: 'wrong' })).status,
    403,
  );
  const registered = await call('/api/account/register', 'POST', body);
  assert.equal(registered.status, 200);
  const account = await registered.json();
  assert.match(account.key, /^[a-f0-9]{64}$/);
  assert.equal((await call('/api/account/register', 'POST', body)).status, 409);
  assert.equal(
    (await call('/api/account/login', 'POST', { ...body, password: 'An incorrect password' }))
      .status,
    401,
  );
  const oldSecret = s.PUBLISHER_KEY;
  s.close();
  s = await storage(dir);
  assert.equal(s.PUBLISHER_KEY, oldSecret);
  assert.equal((await call('/api/account/login', 'POST', body)).status, 200);
  assert.equal((await call('/api/p/alice/snapshot')).status, 401);
  const auth = { Authorization: 'Bearer ' + account.key };
  assert.equal(
    (await call('/api/p/alice/config', 'POST', { password: 'Separate viewer password' }, auth))
      .status,
    200,
  );
  assert.equal(
    (await call('/api/account/login', 'POST', { ...body, password: 'Separate viewer password' }))
      .status,
    401,
  );
  await assert.rejects(s.BUCKET.get('../server-secret'));
  const id = '11111111-1111-4111-8111-111111111111';
  await s.BUCKET.put('alice/' + id, new Uint8Array([255, 216]));
  await s.DB.prepare('INSERT INTO state(id,value) VALUES (?,?)')
    .bind('alice/snapshot', JSON.stringify({ frames: [{ id, at: Date.now() - 91 * 86400000 }] }))
    .run();
  await s.clean();
  assert.equal(await s.BUCKET.get('alice/' + id), null);
});
