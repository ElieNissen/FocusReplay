type Entry = {
  url?: string;
  image?: HTMLImageElement;
  bytes?: number;
  promise: Promise<string>;
  resolve: (url: string) => void;
  reject: (error: Error) => void;
  controller: AbortController;
  loading: boolean;
};
export type BatchLoader = (keys: string[], signal: AbortSignal) => Promise<Map<string, Blob>>;

// One authenticated request retrieves a small group of screen/camera derivatives.
export const loadReplayBatch: BatchLoader = async (keys, signal) => {
  const first = new URL(keys[0], location.origin);
  const endpoint = new URL(first.pathname.replace(/\/image\/[^/]+$/, '/images'), first.origin);
  const names = keys.map((key) => {
    const url = new URL(key, location.origin);
    if (
      url.origin !== first.origin ||
      url.pathname.split('/image/')[0] !== first.pathname.split('/image/')[0]
    )
      throw Error('Profil invalide');
    const name =
      url.pathname.split('/').at(-1) + ':' + (url.searchParams.get('source') || 'screen');
    endpoint.searchParams.append('item', name);
    return name;
  });
  const response = await fetch(endpoint, { signal, cache: 'no-store' });
  if (!response.ok)
    throw Error(response.status === 401 ? 'Accès expiré' : 'Chargement indisponible');
  const body = await response.formData();
  const result = new Map<string, Blob>();
  keys.forEach((key, i) => {
    const value = body.get(names[i]);
    if (value instanceof Blob && value.type.startsWith('image/')) result.set(key, value);
  });
  return result;
};
export class ReplayMediaCache {
  entries = new Map<string, Entry>();
  queue: string[] = [];
  active = 0;
  limit: number;
  concurrency: number;
  loader?: BatchLoader;
  batches = new Set<AbortController>();
  scheduled = false;
  constructor(limit = 160, concurrency = 2, loader?: BatchLoader) {
    this.limit = limit;
    this.concurrency = concurrency;
    this.loader = loader;
  }
  peek(key: string) {
    return this.entries.get(key)?.url;
  }
  trimDecoded() {
    let bytes = 0;
    for (const [, entry] of [...this.entries].reverse()) {
      if (!entry.image) continue;
      bytes += (entry.image.naturalWidth || 640) * (entry.image.naturalHeight || 360) * 4;
      if (bytes > 96 * 1024 * 1024) entry.image = undefined;
    }
  }
  async decoded(key: string): Promise<HTMLImageElement> {
    const url = await this.load(key, true);
    const entry = this.entries.get(key);
    if (!entry || entry.controller.signal.aborted) throw Error('Image invalidée');
    if (!entry.image) {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (this.entries.get(key) !== entry) throw Error('Image invalidée');
      entry.image = image;
      this.trimDecoded();
      return image;
    }
    return entry.image;
  }
  load(key: string, priority = false): Promise<string> {
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      if (priority && !existing.loading && !existing.url) {
        this.queue = this.queue.filter((k) => k !== key);
        this.queue.unshift(key);
      }
      return existing.promise;
    }
    let resolve!: (url: string) => void, reject!: (error: Error) => void;
    const promise = new Promise<string>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    this.entries.set(key, {
      promise,
      resolve,
      reject,
      controller: new AbortController(),
      loading: false,
    });
    priority ? this.queue.unshift(key) : this.queue.push(key);
    if (!this.scheduled) {
      this.scheduled = true;
      queueMicrotask(() => {
        this.scheduled = false;
        this.pump();
      });
    }
    return promise;
  }
  pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const keys = this.queue.splice(0, this.loader ? 16 : 1).filter((key) => {
        const e = this.entries.get(key);
        return e && !e.loading && !e.url;
      });
      if (!keys.length) continue;
      const entries = keys.map((key) => this.entries.get(key)!);
      entries.forEach((e) => (e.loading = true));
      const controller = new AbortController();
      this.batches.add(controller);
      this.active++;
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
      void (async () => {
        try {
          let blobs: Map<string, Blob>;
          if (this.loader) blobs = await this.loader(keys, signal);
          else {
            const response = await fetch(keys[0], { signal, cache: 'no-store' });
            if (!response.ok) throw Error('Image indisponible');
            blobs = new Map([[keys[0], await response.blob()]]);
          }
          await Promise.all(
            keys.map(async (key, i) => {
              const entry = entries[i];
              let url: string | undefined;
              try {
                const blob = blobs.get(key);
                if (!blob?.type.startsWith('image/')) throw Error('Image non reçue');
                if (entry.controller.signal.aborted) throw Error('Image invalidée');
                url = URL.createObjectURL(blob);
                const image = new Image();
                image.src = url;
                await image.decode();
                if (entry.controller.signal.aborted || this.entries.get(key) !== entry)
                  throw Error('Image invalidée');
                entry.url = url;
                entry.image = image;
                entry.bytes = blob.size;
                this.trimDecoded();
                const ready = [...this.entries].filter(([, e]) => e.url);
                while (
                  ready.length > this.limit ||
                  ready.reduce((n, [, e]) => n + (e.bytes || 0), 0) > 96 * 1024 * 1024
                )
                  this.remove(ready.shift()![0]);
                entry.resolve(url);
              } catch (error) {
                if (url) URL.revokeObjectURL(url);
                if (this.entries.get(key) === entry) this.entries.delete(key);
                entry.reject(error instanceof Error ? error : Error('Image indisponible'));
              }
            }),
          );
          let ready = [...this.entries].filter(([, e]) => e.url);
          while (ready.length > this.limit) {
            this.remove(ready.shift()![0]);
          }
        } catch (error) {
          keys.forEach((key, i) => {
            if (this.entries.get(key) === entries[i]) this.entries.delete(key);
            entries[i].reject(error instanceof Error ? error : Error('Image indisponible'));
          });
        } finally {
          this.batches.delete(controller);
          this.active--;
          this.pump();
        }
      })();
    }
  }
  remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.queue = this.queue.filter((k) => k !== key);
    entry.controller.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
    entry.reject(Error('Image invalidée'));
  }
  retain(allowed: Set<string>) {
    for (const key of this.entries.keys()) if (!allowed.has(key)) this.remove(key);
  }
  clear() {
    for (const controller of this.batches) controller.abort();
    for (const key of [...this.entries.keys()]) this.remove(key);
  }
}
