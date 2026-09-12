import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { route } from '../lib/share-api.ts';
import { readFileSync } from 'node:fs';
const secret = 'a'.repeat(64),
  password = 'A sufficiently long password';
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(
    'CREATE TABLE state(id TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE attempts(id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL)',
  );
  for (const { tag } of JSON.parse(
    readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
  ).entries.slice(1))
    sql.exec(readFileSync(new URL('../drizzle/' + tag + '.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(q) {
      return {
        bind(...args) {
          return {
            first: async () => sql.prepare(q).get(...args),
            all: async () => ({ results: sql.prepare(q).all(...args) }),
            run: async () => sql.prepare(q).run(...args),
          };
        },
      };
    },
  };
  const files = new Map(),
    BUCKET = {
      put: async (k, v) => files.set(k, v),
      get: async (k) => (files.has(k) ? { body: files.get(k) } : null),
      delete: async (k) => files.delete(k),
      list: async ({ prefix }) => ({
        objects: [...files.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })),
        truncated: false,
      }),
    };
  const key = (p) =>
    createHmac('sha256', secret)
      .update('publisher:' + p)
      .digest('hex');
  const request = (profile, path, method = 'GET', body, headers = {}) =>
    route(
      new Request('https://example.test/api/p/' + profile + path, {
        method,
        headers: { origin: 'https://example.test', ...headers },
        ...(body === undefined
          ? {}
          : { body: body instanceof Uint8Array ? body : JSON.stringify(body) }),
      }),
      { DB, BUCKET, PUBLISHER_KEY: secret },
    );
  const owner = (p) => ({ authorization: 'Bearer ' + key(p) });
  const config = (p) => request(p, '/config', 'POST', { password }, owner(p));
  const login = async (p) => {
    const r = await request(p, '/login', 'POST', { password });
    assert.equal(r.status, 200);
    return { cookie: r.headers.get('set-cookie').split(';')[0] };
  };
  return { request, owner, config, login, files, sql };
}
test('profile credentials and cookies cannot cross profiles; masked and removed images revoke immediately', async () => {
  const f = fixture();
  await f.config('alice');
  await f.config('bob');
  assert.equal(
    (await f.request('bob', '/config', 'POST', { password }, f.owner('alice'))).status,
    401,
  );
  const a = await f.login('alice'),
    b = await f.login('bob');
  assert.equal((await f.request('bob', '/snapshot', 'GET', undefined, a)).status, 401);
  const id = '11111111-1111-4111-8111-111111111111';
  const snapshot = {
    frames: [{ id, at: Date.now() - 60001, private: false }],
    sessions: [],
    days: [],
    status: 'recording',
  };
  assert.equal(
    (await f.request('alice', '/snapshot', 'PUT', snapshot, f.owner('alice'))).status,
    200,
  );
  assert.equal(
    (
      await f.request(
        'alice',
        '/image/' + id,
        'PUT',
        new Uint8Array([255, 216, 255]),
        f.owner('alice'),
      )
    ).status,
    200,
  );
  assert.equal((await f.request('alice', '/image/' + id)).status, 401);
  assert.equal((await f.request('alice', '/image/' + id, 'GET', undefined, a)).status, 200);
  assert.equal((await f.request('bob', '/image/' + id, 'GET', undefined, b)).status, 404);
  snapshot.frames[0].private = true;
  await f.request('alice', '/snapshot', 'PUT', snapshot, f.owner('alice'));
  assert.equal((await f.request('alice', '/image/' + id, 'GET', undefined, a)).status, 404);
  assert.equal(f.files.size, 0);
  assert.equal(
    (await f.request('alice', '/image/' + id, 'PUT', new Uint8Array([255, 216]), f.owner('alice')))
      .status,
    409,
  );
  await f.config('alice');
  assert.equal((await f.request('alice', '/snapshot', 'GET', undefined, a)).status, 401);
  f.sql.close();
});
test('password login limits attempts, rejects cross-origin, and enforces 800 image quota', async () => {
  const f = fixture();
  await f.config('alice');
  assert.equal(
    (await f.request('alice', '/login', 'POST', { password }, { origin: 'https://other.test' }))
      .status,
    403,
  );
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await f.request('alice', '/login', 'POST', { password: 'incorrect' })).status,
      401,
    );
  assert.equal((await f.request('alice', '/login', 'POST', { password })).status, 429);
  assert.equal(
    (
      await f.request(
        'alice',
        '/snapshot',
        'PUT',
        { frames: Array(801).fill({}), sessions: [], days: [] },
        f.owner('alice'),
      )
    ).status,
    400,
  );
  f.sql.close();
});
test('every private read rejects anonymous requests; only decorative icons are public', async () => {
  const f = fixture();
  await f.config('alice');
  for (const path of ['/snapshot', '/image/11111111-1111-4111-8111-111111111111'])
    assert.equal((await f.request('alice', path)).status, 401);
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual((await readdir(new URL('../public/', import.meta.url))).sort(), [
    'favicon.svg',
    'file.svg',
    'globe.svg',
    'icon.png',
    'window.svg',
  ]);
  f.sql.close();
});
