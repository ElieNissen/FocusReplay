import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHmac } from 'node:crypto';
export async function storage(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.chmod(directory, 0o700);
  const secretFile = path.join(directory, 'server-secret');
  try {
    await fs.writeFile(secretFile, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  const secret = (await fs.readFile(secretFile, 'utf8')).trim();
  const sql = new DatabaseSync(path.join(directory, 'focusreplay.sqlite'));
  sql.exec('PRAGMA journal_mode=WAL;');
  // Idempotent schema migration for a fresh or restarted standalone instance.
  if (sql.prepare('PRAGMA user_version').get().user_version === 0) {
    const migration = await fs.readFile(
      new URL('../drizzle/0000_zippy_valkyrie.sql', import.meta.url),
      'utf8',
    );
    sql.exec('BEGIN;' + migration + ';PRAGMA user_version=1;COMMIT;');
  }
  const DB = {
    prepare(query) {
      return {
        bind(...args) {
          return {
            first: async () => sql.prepare(query).get(...args),
            run: async () => sql.prepare(query).run(...args),
          };
        },
      };
    },
  };
  const root = path.join(directory, 'images');
  await fs.mkdir(root, { recursive: true });
  function target(key) {
    if (!/^[a-z0-9-]{1,48}\/[-a-f0-9]{36}$/.test(key)) throw Error('Invalid object key');
    return path.join(root, ...key.split('/'));
  }
  const BUCKET = {
    async put(key, bytes) {
      const file = target(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file + '.tmp', bytes);
      await fs.rename(file + '.tmp', file);
    },
    async get(key) {
      try {
        return { body: await fs.readFile(target(key)) };
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    async delete(key) {
      await fs.rm(target(key), { force: true });
    },
    async list({ prefix, limit = 1000, cursor }) {
      if (!/^[a-z0-9-]{1,48}\/$/.test(prefix)) throw Error('Invalid prefix');
      let files = [];
      try {
        files = await fs.readdir(path.join(root, prefix));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      const keys = files
        .filter((f) => /^[-a-f0-9]{36}$/.test(f))
        .sort()
        .map((f) => prefix + f)
        .filter((k) => !cursor || k > cursor);
      return {
        objects: keys.slice(0, limit).map((key) => ({ key })),
        truncated: keys.length > limit,
        cursor: keys[limit - 1],
      };
    },
  };
  async function clean() {
    const cutoff = Date.now() - 90 * 86400000;
    for (const row of sql.prepare("SELECT id,value FROM state WHERE id LIKE '%/snapshot'").all()) {
      const s = JSON.parse(row.value);
      if (!s) continue;
      const expired = s.frames.filter((f) => f.at < cutoff);
      if (!expired.length) continue;
      const prefix = row.id.slice(0, -8);
      for (const f of expired) await BUCKET.delete(prefix + f.id);
      s.frames = s.frames.filter((f) => f.at >= cutoff);
      sql.prepare('UPDATE state SET value=? WHERE id=?').run(JSON.stringify(s), row.id);
    }
    sql.prepare('DELETE FROM attempts WHERE expires < ?').run(Date.now());
  }
  return {
    DB,
    BUCKET,
    PUBLISHER_KEY: secret,
    invitation:
      process.env.REGISTRATION_CODE ||
      createHmac('sha256', secret).update('registration').digest('hex').slice(0, 24),
    clean,
    close: () => sql.close(),
  };
}
