import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { storage } from '../standalone/storage.mjs';
import { route } from '../lib/share-api.ts';
test('open email accounts, atomic uniqueness, browser isolation and revocable sessions', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-accounts-'));
  const store = await storage(dir);
  t.after(async () => {
    store.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const env = { ...store, OPEN_REGISTRATION: 'true', MAX_ACCOUNTS: '3' };
  let ip = 0;
  const call = (p, method = 'GET', body, headers = {}) =>
    route(
      new Request('https://example.test' + p, {
        method,
        headers: { origin: 'https://example.test', 'cf-connecting-ip': 'test-' + ip++, ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  const alice = {
    profile: 'alice',
    email: 'Alice@Example.test',
    password: 'A long account password',
    browser: true,
  };
  assert.equal((await call('/api/account/register', 'POST', { ...alice, email: '' })).status, 400);
  assert.equal(
    (await call('/api/account/register', 'POST', alice, { origin: 'https://attacker.test' }))
      .status,
    403,
  );
  const registration = await call('/api/account/register', 'POST', alice);
  assert.equal(registration.status, 200);
  assert.deepEqual(await registration.json(), { profile: 'alice' });
  const cookieHeader = registration.headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly; Secure; SameSite=Strict/);
  const cookie = cookieHeader.split(';')[0];
  assert.equal((await call('/api/account/me', 'GET', null, { cookie })).status, 200);
  assert.equal((await call('/api/p/alice/snapshot', 'GET', null, { cookie })).status, 200);
  assert.equal((await call('/api/p/bob/snapshot', 'GET', null, { cookie })).status, 401);
  assert.equal(
    (await call('/api/p/bob/image/11111111-1111-4111-8111-111111111111', 'GET', null, { cookie }))
      .status,
    401,
  );
  assert.equal(
    (await call('/api/p/alice/config', 'POST', { password: alice.password }, { cookie })).status,
    401,
  );
  assert.equal(
    (
      await call('/api/account/register', 'POST', {
        ...alice,
        profile: 'other',
        email: 'alice@example.test',
      })
    ).status,
    409,
  );
  const login = await call('/api/account/login', 'POST', {
    email: ' ALICE@example.test ',
    password: alice.password,
  });
  assert.equal(login.status, 200);
  assert.match((await login.json()).key, /^[a-f0-9]{64}$/);
  assert.equal(
    (
      await call('/api/account/login', 'POST', {
        email: alice.email,
        password: 'Wrong long password',
      })
    ).status,
    401,
  );
  const races = await Promise.all(
    ['bob', 'charlie'].map((profile) =>
      call('/api/account/register', 'POST', { ...alice, profile, email: 'same@example.test' }),
    ),
  );
  assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await call('/api/account/logout', 'POST', null, { cookie, origin: 'https://attacker.test' }))
      .status,
    403,
  );
  assert.equal((await call('/api/account/logout', 'POST', null, { cookie })).status, 200);
  assert.equal((await call('/api/account/me', 'GET', null, { cookie })).status, 401);
  assert.equal((await call('/api/p/alice/snapshot', 'GET', null, { cookie })).status, 401);
  assert.equal(
    (
      await call('/api/account/register', 'POST', {
        ...alice,
        profile: 'third',
        email: 'third@example.test',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call('/api/account/register', 'POST', {
        ...alice,
        profile: 'fourth',
        email: 'fourth@example.test',
      })
    ).status,
    409,
  );
});
