const headers = {
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};
const json = (value: unknown, status = 200, extra = {}) =>
  Response.json(value, { status, headers: { ...headers, ...extra } });
const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, '0')).join('');
async function digest(text: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}
async function hash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return hex(
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      key,
      256,
    ),
  );
}
async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
async function get(db: any, id: string) {
  const row = await db.prepare('SELECT value FROM state WHERE id = ?').bind(id).first();
  return row ? JSON.parse(row.value) : null;
}
async function put(db: any, id: string, value: unknown) {
  await db
    .prepare(
      'INSERT INTO state (id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
    )
    .bind(id, JSON.stringify(value))
    .run();
}
async function limitedBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) throw Error('too-large');
  const reader = request.body?.getReader();
  let size = 0;
  const chunks = [];
  if (reader)
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw Error('too-large');
      }
      chunks.push(value);
    }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}
function sessionToken(request: Request) {
  return (
    request.headers
      .get('cookie')
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('focus_account='))
      ?.slice(14) || ''
  );
}
async function browserAccount(request: Request, e: any) {
  const token = sessionToken(request);
  if (!/^[a-f0-9-]{36}$/.test(token)) return null;
  const session = await get(e.DB, 'owner-session/' + (await digest(token)));
  return session?.expires > Date.now() ? session.profile : null;
}
async function accountRoute(request: Request, e: any) {
  const url = new URL(request.url),
    db = e.DB;
  if (!db || !e.PUBLISHER_KEY) return json({ error: 'Service indisponible.' }, 503);
  if (url.pathname === '/api/account/options' && request.method === 'GET')
    return json({ invitationRequired: e.OPEN_REGISTRATION !== 'true' });
  if (url.pathname === '/api/account/me' && request.method === 'GET') {
    const profile = await browserAccount(request, e);
    return profile ? json({ profile }) : json({ error: 'Connexion requise.' }, 401);
  }
  if (request.method !== 'POST') return json({ error: 'Méthode refusée.' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return json({ error: 'Accès refusé.' }, 403);
  if (url.pathname === '/api/account/logout') {
    if (origin !== url.origin) return json({ error: 'Accès refusé.' }, 403);
    if (sessionToken(request))
      await put(db, 'owner-session/' + (await digest(sessionToken(request))), null);
    return json({ ok: true }, 200, {
      'Set-Cookie': 'focus_account=; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=0',
    });
  }
  if (!['/api/account/register', '/api/account/login'].includes(url.pathname))
    return json({ error: 'Introuvable.' }, 404);
  const now = Date.now(),
    attemptKey =
      'account:' +
      (await digest(
        (request.headers.get('cf-connecting-ip') || 'local') + Math.floor(now / 60000),
      ));
  const attempt = await db
    .prepare(
      'INSERT INTO attempts(id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count',
    )
    .bind(attemptKey, now + 120000)
    .first();
  await db.prepare('DELETE FROM attempts WHERE expires < ?').bind(now).run();
  if (attempt.count > 8)
    return json({ error: 'Trop de tentatives. Réessayez dans une minute.' }, 429);
  let body: any;
  try {
    body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 2048)));
  } catch {
    return json({ error: 'Formulaire invalide.' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ error: 'Formulaire invalide.' }, 400);
  if (body.browser && origin !== url.origin) return json({ error: 'Accès refusé.' }, 403);
  const registering = url.pathname === '/api/account/register';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  let id = typeof body.profile === 'string' ? body.profile.trim().toLowerCase() : '';
  if (!registering && email) {
    const row = await db
      .prepare(
        "SELECT id FROM state WHERE id LIKE '%/account' AND json_extract(value, '$.email') = ? LIMIT 1",
      )
      .bind(email)
      .first();
    id = row?.id?.slice(0, -8) || '';
  }
  if (
    !/^[a-z0-9][a-z0-9-]{2,39}$/.test(id) ||
    typeof body.password !== 'string' ||
    body.password.length < 12 ||
    body.password.length > 128
  )
    return json(
      {
        error: registering
          ? 'Pseudo de 3 à 40 caractères et mot de passe de 12 caractères minimum.'
          : 'E-mail, identifiant ou mot de passe incorrect.',
      },
      registering ? 400 : 401,
    );
  const accountId = id + '/account',
    account = await get(db, accountId),
    key = await sign('publisher:' + id, e.PUBLISHER_KEY);
  if (registering) {
    if (e.OPEN_REGISTRATION === 'true') {
      const registrationKey =
        'register:' +
        (await digest(
          (request.headers.get('cf-connecting-ip') || 'local') + Math.floor(now / 3600000),
        ));
      const registrationAttempt = await db
        .prepare(
          'INSERT INTO attempts(id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count',
        )
        .bind(registrationKey, now + 7200000)
        .first();
      if (registrationAttempt.count > 3)
        return json(
          {
            error: 'Trop de créations de compte depuis cette connexion. Réessayez dans une heure.',
          },
          429,
        );
    }
    if (
      (email || e.OPEN_REGISTRATION === 'true') &&
      (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
      return json({ error: 'Saisissez une adresse e-mail valide.' }, 400);
    const invitation =
      e.REGISTRATION_CODE || (await sign('registration', e.PUBLISHER_KEY)).slice(0, 24);
    if (e.OPEN_REGISTRATION !== 'true' && body.invitation !== invitation)
      return json(
        { error: 'Ce serveur est sur invitation. Demandez un code à son administrateur.' },
        403,
      );
    if (account || (await get(db, id + '/config')))
      return json({ error: 'Cet identifiant est déjà utilisé.' }, 409);
    const salt = crypto.randomUUID(),
      value = JSON.stringify({
        salt,
        hash: await hash(body.password, salt),
        createdAt: now,
        ...(email ? { email, emailVerified: false } : {}),
      });
    const limit = Math.max(1, Math.min(10000, Number(e.MAX_ACCOUNTS) || 100));
    const inserted = await db
      .prepare(
        "INSERT INTO state(id,value) SELECT ?,? WHERE (SELECT COUNT(*) FROM state WHERE id LIKE '%/account') < ? AND (? = '' OR NOT EXISTS (SELECT 1 FROM state WHERE id LIKE '%/account' AND json_extract(value, '$.email') = ?)) ON CONFLICT(id) DO NOTHING RETURNING id",
      )
      .bind(accountId, value, limit, email, email)
      .first();
    if (!inserted)
      return json(
        {
          error:
            'Création impossible : compte déjà existant ou inscriptions temporairement complètes. Essayez de vous connecter.',
        },
        409,
      );
  } else if (url.pathname === '/api/account/login') {
    if (!account || (await hash(body.password, account.salt)) !== account.hash)
      return json({ error: 'Identifiant ou mot de passe incorrect.' }, 401);
  } else return json({ error: 'Introuvable.' }, 404);
  if (body.browser) {
    const token = crypto.randomUUID();
    await db
      .prepare(
        "DELETE FROM state WHERE id LIKE 'owner-session/%' AND (value = 'null' OR json_extract(value, '$.expires') < ?)",
      )
      .bind(now)
      .run();
    await put(db, 'owner-session/' + (await digest(token)), {
      profile: id,
      expires: now + 86400000,
    });
    return json({ profile: id }, 200, {
      'Set-Cookie': `focus_account=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=86400`,
    });
  }
  return json({ profile: id, key, configured: Boolean(await get(db, id + '/config')) });
}
export async function route(request: Request, e: any) {
  const db = e.DB,
    bucket = e.BUCKET,
    url = new URL(request.url);
  if (url.pathname.startsWith('/api/account/')) return accountRoute(request, e);
  const match = url.pathname.match(/^\/api\/p\/([a-z0-9-]{1,48})(\/.*)$/);
  if (!match) return json({ error: 'Profil introuvable.' }, 404);
  const profile = match[1],
    path = '/api' + match[2],
    prefix = profile + '/',
    cookieName = 'focus_view_' + profile;
  const stateGet = (id: string) => get(db, prefix + id);
  const statePut = (id: string, value: unknown) => put(db, prefix + id, value);
  if (!db || !bucket || !e.PUBLISHER_KEY) return json({ error: 'Partage indisponible.' }, 503);
  const profileKey = await sign('publisher:' + profile, e.PUBLISHER_KEY);
  const owner = request.headers.get('authorization') === 'Bearer ' + profileKey;
  const config = await stateGet('config');
  if (path === '/api/config' && request.method === 'POST') {
    if (!owner) return json({ error: 'Accès refusé.' }, 401);
    const body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 2048)));
    if (
      typeof body.password !== 'string' ||
      body.password.length < 12 ||
      body.password.length > 128
    )
      return json({ error: 'Utilisez un mot de passe de 12 à 128 caractères.' }, 400);
    const salt = crypto.randomUUID();
    await statePut('config', {
      salt,
      hash: await hash(body.password, salt),
      revision: crypto.randomUUID(),
    });
    return json({ ok: true });
  }
  if (path === '/api/login' && request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin) return json({ error: 'Accès refusé.' }, 403);
    const now = Date.now(),
      key = await digest(
        profile + (request.headers.get('cf-connecting-ip') || 'local') + Math.floor(now / 60000),
      );
    const count = await db
      .prepare(
        'INSERT INTO attempts(id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count',
      )
      .bind(key, now + 120000)
      .first();
    await db.prepare('DELETE FROM attempts WHERE expires < ?').bind(now).run();
    if (count.count > 5)
      return json({ error: 'Trop de tentatives. Réessayez dans une minute.' }, 429);
    const body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 2048)));
    if (
      !config ||
      typeof body.password !== 'string' ||
      body.password.length > 128 ||
      (await hash(body.password, config.salt)) !== config.hash
    )
      return json({ error: 'Mot de passe incorrect ou partage non configuré.' }, 401);
    const token = now + 12 * 3600000 + '.' + config.revision;
    const signature = await sign(token, profileKey);
    return json({ ok: true }, 200, {
      'Set-Cookie': `${cookieName}=${token}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/api/p/${profile}; Max-Age=43200`,
    });
  }
  if (path === '/api/logout')
    return json({ ok: true }, 200, {
      'Set-Cookie': `${cookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/api/p/${profile}; Max-Age=0`,
    });
  if (owner) {
    if (path === '/api/snapshot' && request.method === 'GET')
      return json(await stateGet('snapshot'));
    if (path === '/api/snapshot' && request.method === 'PUT') {
      if (!config) return json({ error: 'Définissez le mot de passe.' }, 409);
      const body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 1500000)));
      if (
        !Array.isArray(body.frames) ||
        body.frames.length > 800 ||
        !Array.isArray(body.sessions) ||
        !Array.isArray(body.days)
      )
        return json({ error: 'Format invalide.' }, 400);
      if (body.frames.some((f: any) => !/^[-a-f0-9]{36}$/.test(f.id) || !Number.isFinite(f.at)))
        return json({ error: 'Capture invalide.' }, 400);
      body.frames = body.frames.filter((f: any) => f.at > Date.now() - 90 * 86400000);
      body.syncedAt = Date.now();
      await statePut('snapshot', body);
      // An image is served only while listed in the current manifest. Removed/redacted images become inaccessible immediately.
      const allowed = new Set(body.frames.filter((f: any) => !f.private).map((f: any) => f.id));
      let cursor: string | undefined;
      do {
        const listed: any = await bucket.list({ prefix, limit: 1000, cursor });
        await Promise.all(
          listed.objects
            .filter((o: any) => !allowed.has(o.key.slice(prefix.length)))
            .map((o: any) => bucket.delete(o.key)),
        );
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
      return json({ ok: true });
    }
    if (path === '/api/snapshot' && request.method === 'DELETE') {
      await statePut('snapshot', null);
      let cursor: string | undefined;
      do {
        const list: any = await bucket.list({ prefix, limit: 1000, cursor });
        await Promise.all(list.objects.map((o: any) => bucket.delete(o.key)));
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
      return json({ ok: true });
    }
    if (path.startsWith('/api/image/') && request.method === 'PUT') {
      const id = path.slice(11);
      if (!/^[-a-f0-9]{36}$/.test(id)) return json({ error: 'Image invalide.' }, 400);
      const manifest = await stateGet('snapshot');
      if (
        !manifest?.frames.some(
          (f: any) => f.id === id && !f.private && f.at > Date.now() - 90 * 86400000,
        )
      )
        return json({ error: 'Capture non autorisée.' }, 409);
      const bytes = await limitedBody(request, 50000);
      if (bytes[0] !== 255 || bytes[1] !== 216) return json({ error: 'JPEG requis.' }, 400);
      await bucket.put(prefix + id, bytes, {
        httpMetadata: { contentType: 'image/jpeg' },
      });
      return json({ ok: true });
    }
  }
  const cookie =
    request.headers
      .get('cookie')
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1) || '';
  const [expires, revision, signature] = cookie.split('.');
  const ownRead = request.method === 'GET' && (await browserAccount(request, e)) === profile;
  if (
    !ownRead &&
    (!config ||
      revision !== config.revision ||
      Number(expires) < Date.now() ||
      !signature ||
      signature !== (await sign(expires + '.' + revision, profileKey)))
  )
    return json({ error: 'Mot de passe requis.' }, 401);
  const snapshot = await stateGet('snapshot');
  if (path === '/api/snapshot' && request.method === 'GET') {
    if (!snapshot)
      return json({
        frames: [],
        sessions: [],
        days: [],
        status: 'offline',
        syncedAt: 0,
      });
    snapshot.frames = snapshot.frames.filter((f: any) => f.at > Date.now() - 90 * 86400000);
    if (Date.now() - snapshot.syncedAt > 120000) snapshot.status = 'offline';
    return json(snapshot);
  }
  if (path.startsWith('/api/image/') && request.method === 'GET') {
    const id = path.slice(11);
    if (
      !snapshot?.frames.some(
        (f: any) => f.id === id && !f.private && f.at > Date.now() - 90 * 86400000,
      )
    )
      return json({ error: 'Image indisponible.' }, 404);
    const object = await bucket.get(prefix + id);
    return object
      ? new Response(object.body, {
          headers: { ...headers, 'Content-Type': 'image/jpeg' },
        })
      : json({ error: 'Image indisponible.' }, 404);
  }
  return json({ error: 'Introuvable.' }, 404);
}
