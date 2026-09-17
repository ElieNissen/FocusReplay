import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReplayMediaCache } from '../lib/replay-cache.ts';

test('deduplicates, decodes and reuses images; evicts and revokes on policy changes', async () => {
  const originalFetch = globalThis.fetch,
    originalImage = globalThis.Image;
  let requests = 0,
    decodes = 0;
  globalThis.fetch = async () => {
    requests++;
    return new Response(new Blob(['fixture'], { type: 'image/jpeg' }));
  };
  globalThis.Image = class {
    async decode() {
      decodes++;
    }
  };
  const cache = new ReplayMediaCache(2, 2);
  try {
    const [a, b] = await Promise.all([cache.load('a'), cache.load('a', true)]);
    assert.equal(a, b);
    assert.equal(requests, 1);
    assert.equal(decodes, 1);
    await cache.load('b');
    await cache.load('a');
    await cache.load('c');
    assert.equal(cache.peek('b'), undefined);
    assert.equal(cache.peek('a'), a);
    cache.retain(new Set(['c']));
    assert.equal(cache.peek('a'), undefined);
    cache.clear();
    assert.equal(cache.entries.size, 0);
  } finally {
    cache.clear();
    globalThis.fetch = originalFetch;
    globalThis.Image = originalImage;
  }
});

test('prioritizes scrubbing over queued preloads and cancels revoked images', async () => {
  const originalFetch = globalThis.fetch,
    originalImage = globalThis.Image;
  const started = [],
    release = [];
  globalThis.fetch = (key, { signal }) =>
    new Promise((resolve, reject) => {
      started.push(key);
      release.push(() => resolve(new Response(new Blob(['x'], { type: 'image/jpeg' }))));
      signal.addEventListener('abort', () => reject(Error('aborted')));
    });
  globalThis.Image = class {
    async decode() {}
  };
  const cache = new ReplayMediaCache(8, 1);
  try {
    const first = cache.load('first'),
      queued = cache.load('preload').catch(() => null),
      priority = cache.load('cursor', true).catch(() => null);
    release.shift()();
    await first;
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(started, ['first', 'cursor']);
    cache.clear();
    assert.equal(await priority, null);
    assert.equal(await queued, null);
    assert.equal(cache.entries.size, 0);
  } finally {
    cache.clear();
    globalThis.fetch = originalFetch;
    globalThis.Image = originalImage;
  }
});
