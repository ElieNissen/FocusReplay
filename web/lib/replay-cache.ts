export class ReplayMediaCache {
  entries = new Map<
    string,
    {
      url?: string;
      promise: Promise<string>;
      resolve: (url: string) => void;
      reject: (error: Error) => void;
      controller: AbortController;
      loading: boolean;
    }
  >();
  queue: string[] = [];
  active = 0;
  limit: number;
  concurrency: number;
  constructor(limit = 96, concurrency = 6) {
    this.limit = limit;
    this.concurrency = concurrency;
  }
  peek(key: string) {
    return this.entries.get(key)?.url;
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
    this.pump();
    return promise;
  }
  pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const key = this.queue.shift()!,
        entry = this.entries.get(key);
      if (!entry || entry.loading) continue;
      entry.loading = true;
      this.active++;
      void (async () => {
        let url: string | undefined;
        try {
          const response = await fetch(key, { signal: AbortSignal.any([entry.controller.signal, AbortSignal.timeout(15000)]), cache: 'no-store' });
          if (!response.ok)
            throw Error(response.status === 401 ? 'Accès expiré' : 'Image indisponible');
          const blob = await response.blob();
          if (!blob.type.startsWith('image/')) throw Error('Image invalide');
          url = URL.createObjectURL(blob);
          const image = new Image();
          image.src = url;
          await image.decode();
          if (entry.controller.signal.aborted || this.entries.get(key) !== entry)
            throw Error('Image invalidée');
          entry.url = url;
          entry.resolve(url);
          while (this.entries.size > this.limit) {
            const old = [...this.entries].find(([k, e]) => k !== key && e.url);
            if (!old) break;
            this.remove(old[0]);
          }
        } catch (e) {
          if (url) URL.revokeObjectURL(url);
          if (this.entries.get(key) === entry) this.entries.delete(key);
          entry.reject(e instanceof Error ? e : Error('Image indisponible'));
        } finally {
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
    if (!entry.loading) entry.reject(Error('Image invalidée'));
  }
  retain(allowed: Set<string>) {
    for (const key of this.entries.keys()) if (!allowed.has(key)) this.remove(key);
  }
  clear() {
    for (const key of [...this.entries.keys()]) this.remove(key);
  }
}
