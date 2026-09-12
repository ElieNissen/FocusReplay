const valid = (s: unknown): s is string =>
  typeof s === 'string' && /^[a-z0-9][a-z0-9-]{2,39}$/.test(s);
const blockedSQL = `SELECT 1 FROM social_access WHERE blocked=1 AND ((owner=? AND viewer=?) OR (owner=? AND viewer=?))`;
export async function friendScope(db: any, owner: string, viewer: string | null) {
  if (!viewer || viewer === owner) return null;
  const [a, b] = [owner, viewer].sort();
  return db
    .prepare(
      `SELECT g.* FROM social_access g WHERE owner=? AND viewer=? AND (live=1 OR replay=1) AND EXISTS(SELECT 1 FROM social_friends WHERE a=? AND b=? AND accepted=1) AND NOT EXISTS(${blockedSQL})`,
    )
    .bind(owner, viewer, a, b, owner, viewer, viewer, owner)
    .first();
}
export function scopedReplay(snapshot: any, grant: any) {
  if (!snapshot) return null;
  const sessions = snapshot.sessions.filter((s: any) => (s.endedAt ? grant.replay : grant.live));
  const ids = new Set(sessions.map((s: any) => s.id));
  const clipped = (values: any[]) =>
    values.flatMap((v) =>
      sessions.flatMap((s: any) => {
        const from = Math.max(v.from, s.startedAt),
          to = Math.min(v.to, s.endedAt || Date.now());
        return to > from ? [{ ...v, from, to, ...(!grant.stats ? { workMs: 0 } : {}) }] : [];
      }),
    );
  return {
    syncedAt: snapshot.syncedAt,
    status: grant.live ? snapshot.status : 'offline',
    sessions: sessions.map((s: any) => ({ ...s, ...(!grant.stats ? { workMs: 0 } : {}) })),
    frames: snapshot.frames
      .filter((f: any) => ids.has(f.sessionId))
      .map((f: any) => (grant.software ? f : { ...f, app: '', domain: '', category: 'unknown' })),
    overview: grant.software ? clipped(snapshot.overview || []) : [],
    gaps: clipped(snapshot.gaps || []),
    days: grant.stats ? snapshot.days : [],
  };
}
async function rows(db: any, sql: string, ...args: any[]) {
  return (
    await db
      .prepare(sql)
      .bind(...args)
      .all()
  ).results;
}
export async function updateSocialSummary(db: any, profile: string, snapshot: any) {
  const days = (Array.isArray(snapshot?.days) ? snapshot.days : [])
    .filter(
      (d: any) =>
        d && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && Number.isFinite(d.workMs) && d.workMs >= 0,
    )
    .map((d: any) => ({ day: d.day, workMs: Math.min(86400000, d.workMs) }))
    .sort((a: any, b: any) => a.day.localeCompare(b.day))
    .slice(-366);
  const item = [...(Array.isArray(snapshot?.overview) ? snapshot.overview : [])]
    .filter(Boolean)
    .sort((a: any, b: any) => b.to - a.to)[0];
  const software =
    item && !item.private && typeof item.app === 'string' ? item.app.slice(0, 120) : '';
  const session = [...(Array.isArray(snapshot?.sessions) ? snapshot.sessions : [])]
    .filter((s) => s && Number.isFinite(s.startedAt))
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  const lastSession = session
    ? {
        startedAt: session.startedAt,
        endedAt: Number.isFinite(session.endedAt) ? session.endedAt : null,
        workMs: Number.isFinite(session.workMs)
          ? Math.max(0, Math.min(86400000, session.workMs))
          : 0,
      }
    : null;
  const previews = (Array.isArray(snapshot?.frames) ? snapshot.frames : [])
    .filter(
      (f: any) =>
        f &&
        !f.private &&
        f.available &&
        /^[-a-f0-9]{36}$/.test(f.id) &&
        f.at <= Date.now() - 300000 &&
        f.at > Date.now() - 86400000,
    )
    .sort((a: any, b: any) => a.at - b.at)
    .slice(-6)
    .map((f: any) => ({ id: f.id, at: f.at }));
  await db
    .prepare(
      'UPDATE social_profiles SET status=?,updated=?,days=?,software=?,last_session=?,previews=? WHERE profile=?',
    )
    .bind(
      ['recording', 'paused'].includes(snapshot?.status) ? snapshot.status : 'offline',
      snapshot ? Date.now() : 0,
      JSON.stringify(days),
      software,
      JSON.stringify(lastSession),
      JSON.stringify(previews),
      profile,
    )
    .run();
}
export async function socialRoute(request: Request, e: any, helpers: any) {
  const { json, browserAccount, limitedBody } = helpers,
    db = e.DB,
    url = new URL(request.url);
  const me = await browserAccount(request, e);
  const preview = url.pathname.match(
    /^\/api\/social\/preview\/([a-z0-9-]{3,40})\/([-a-f0-9]{36})$/,
  );
  if (request.method === 'GET' && preview) {
    const [, profile, id] = preview;
    const owner = await db
      .prepare(
        'SELECT previews FROM social_profiles WHERE profile=? AND discoverable=1 AND public_activity=1 AND public_preview=1',
      )
      .bind(profile)
      .first();
    if (!owner || !JSON.parse(owner.previews).some((f: any) => f.id === id))
      return json({ error: 'Aperçu indisponible.' }, 404);
    if (me && (await db.prepare(blockedSQL).bind(me, profile, profile, me).first()))
      return json({ error: 'Aperçu indisponible.' }, 404);
    const raw = await db
      .prepare('SELECT value FROM state WHERE id=?')
      .bind(profile + '/snapshot')
      .first();
    const frame =
      raw &&
      JSON.parse(raw.value)?.frames.find(
        (f: any) =>
          f.id === id &&
          !f.private &&
          f.available &&
          f.at <= Date.now() - 300000 &&
          f.at > Date.now() - 86400000,
      );
    if (!frame) return json({ error: 'Aperçu indisponible.' }, 404);
    const file = await e.BUCKET.get(profile + '/' + id);
    return file
      ? new Response(file.body, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-store, private',
            'X-Content-Type-Options': 'nosniff',
            'X-Robots-Tag': 'noindex',
          },
        })
      : json({ error: 'Aperçu indisponible.' }, 404);
  }
  if (request.method === 'GET' && url.pathname === '/api/social/discover') {
    const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
      return json({ error: 'Page invalide.' }, 400);
    const values = await rows(
      db,
      `SELECT profile,name,status,updated,days,last_session,public_preview,previews FROM social_profiles p
      WHERE public_activity=1 AND discoverable=1 AND NOT EXISTS(SELECT 1 FROM social_access WHERE blocked=1 AND ((owner=? AND viewer=p.profile) OR (owner=p.profile AND viewer=?)))
      ORDER BY CASE WHEN status='recording' AND updated>? THEN 0 WHEN status='paused' AND updated>? THEN 1 ELSE 2 END,updated DESC,profile LIMIT 21 OFFSET ?`,
      me || '',
      me || '',
      Date.now() - 900000,
      Date.now() - 900000,
      offset,
    );
    return json({
      items: values.slice(0, 20).map((p: any) => ({
        profile: p.profile,
        name: p.name,
        status: Date.now() - p.updated > 900000 ? 'offline' : p.status,
        updated: p.updated,
        days: JSON.parse(p.days).slice(-7),
        session: JSON.parse(p.last_session),
        previews: p.public_preview ? JSON.parse(p.previews) : [],
      })),
      more: values.length > 20,
    });
  }
  if (!me) return json({ error: 'Connexion requise.' }, 401);
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Méthode refusée.' }, 405);
  if (request.method === 'POST' && request.headers.get('origin') !== url.origin)
    return json({ error: 'Accès refusé.' }, 403);
  const q = db.prepare.bind(db);
  const isBlocked = (peer: string) => q(blockedSQL).bind(me, peer, peer, me).first();
  const own = await q(
    'SELECT profile,name,discoverable,public_activity,public_preview FROM social_profiles WHERE profile=?',
  )
    .bind(me)
    .first();
  if (request.method === 'GET' && url.pathname === '/api/social') {
    const peers = await rows(
      db,
      `SELECT p.profile,p.name,f.requester,f.accepted,
      p.status,p.updated,p.days,p.software,
      COALESCE(inbound.presence,0) AS show_presence, COALESCE(inbound.stats,0) AS show_stats, COALESCE(inbound.software,0) AS show_software,
      COALESCE(outbound.presence,0) AS give_presence, COALESCE(outbound.stats,0) AS give_stats, COALESCE(outbound.software,0) AS give_software,
      COALESCE(outbound.live,0) AS give_live,COALESCE(outbound.replay,0) AS give_replay
      FROM social_friends f JOIN social_profiles p ON p.profile=CASE WHEN f.a=? THEN f.b ELSE f.a END
      LEFT JOIN social_access inbound ON inbound.owner=p.profile AND inbound.viewer=?
      LEFT JOIN social_access outbound ON outbound.owner=? AND outbound.viewer=p.profile
      WHERE (f.a=? OR f.b=?) AND COALESCE(inbound.blocked,0)=0 AND COALESCE(outbound.blocked,0)=0
      ORDER BY f.accepted DESC,p.profile LIMIT 50`,
      me,
      me,
      me,
      me,
      me,
    );
    const blocks = await rows(
      db,
      'SELECT viewer AS profile FROM social_access WHERE owner=? AND blocked=1 ORDER BY viewer LIMIT 100',
      me,
    );
    return json({
      me: own || { profile: me, name: me, discoverable: 0 },
      blocks,
      peers: peers.map((p: any) => ({
        profile: p.profile,
        name: p.name,
        relationship: p.accepted ? 'friend' : p.requester === me ? 'outgoing' : 'incoming',
        grants: {
          presence: Boolean(p.give_presence),
          stats: Boolean(p.give_stats),
          software: Boolean(p.give_software),
          live: Boolean(p.give_live),
          replay: Boolean(p.give_replay),
        },
        ...(p.accepted && p.show_presence
          ? { status: Date.now() - p.updated > 900000 ? 'offline' : p.status, updated: p.updated }
          : {}),
        ...(p.accepted && p.show_stats ? { days: JSON.parse(p.days) } : {}),
        ...(p.accepted && p.show_software && Date.now() - p.updated <= 900000
          ? { software: p.software }
          : {}),
      })),
    });
  }
  if (request.method === 'GET' && url.pathname === '/api/social/search') {
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(query)) return json({ items: [] });
    const result = await rows(
      db,
      `SELECT profile,name FROM social_profiles p WHERE discoverable=1 AND profile<>? AND profile LIKE ?
      AND NOT EXISTS(SELECT 1 FROM social_access WHERE blocked=1 AND ((owner=? AND viewer=p.profile) OR (owner=p.profile AND viewer=?))) ORDER BY profile LIMIT 20`,
      me,
      query + '%',
      me,
      me,
    );
    return json({ items: result });
  }
  if (request.method !== 'POST') return json({ error: 'Introuvable.' }, 404);
  const bucket = 'social:' + me + ':' + Math.floor(Date.now() / 60000);
  const rate = await q(
    'INSERT INTO attempts(id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count',
  )
    .bind(bucket, Date.now() + 120000)
    .first();
  if (rate.count > 30)
    return json({ error: 'Trop de changements. Réessayez dans une minute.' }, 429);
  await q('DELETE FROM attempts WHERE expires < ?').bind(Date.now()).run();
  let body: any;
  try {
    body = JSON.parse(new TextDecoder().decode(await limitedBody(request, 2048)));
  } catch {
    return json({ error: 'Formulaire invalide.' }, 400);
  }
  if (!body || typeof body !== 'object') return json({ error: 'Formulaire invalide.' }, 400);
  if (url.pathname === '/api/social/profile') {
    if (
      typeof body.name !== 'string' ||
      !body.name.trim() ||
      body.name.length > 60 ||
      typeof body.discoverable !== 'boolean' ||
      typeof body.publicActivity !== 'boolean'
    )
      return json({ error: 'Nom ou visibilité invalide.' }, 400);
    if (body.publicPreview !== undefined && typeof body.publicPreview !== 'boolean')
      return json({ error: 'Choix invalide.' }, 400);
    await q(
      'INSERT INTO social_profiles(profile,name,discoverable,public_activity,public_preview) VALUES (?,?,?,?,?) ON CONFLICT(profile) DO UPDATE SET name=excluded.name,discoverable=excluded.discoverable,public_activity=excluded.public_activity,public_preview=excluded.public_preview',
    )
      .bind(
        me,
        body.name.trim(),
        +body.discoverable,
        +(body.discoverable && body.publicActivity),
        +(body.discoverable && body.publicActivity && !!body.publicPreview),
      )
      .run();
    const snapshot = await q('SELECT value FROM state WHERE id=?')
      .bind(me + '/snapshot')
      .first();
    // Preserve heartbeat age when joining the directory; saving a profile is not a live signal.
    await updateSocialSummary(db, me, snapshot ? JSON.parse(snapshot.value) : null);
    if (snapshot)
      await q('UPDATE social_profiles SET updated=? WHERE profile=?')
        .bind(JSON.parse(snapshot.value)?.syncedAt || 0, me)
        .run();
    return json({ ok: true });
  }
  const peer = body.peer;
  if (!valid(peer) || peer === me) return json({ error: 'Profil invalide.' }, 400);
  const [a, b] = [me, peer].sort();
  if (url.pathname === '/api/social/block') {
    if (typeof body.blocked !== 'boolean') return json({ error: 'Choix invalide.' }, 400);
    if (body.blocked) {
      await q(
        'INSERT INTO social_access(owner,viewer,blocked) VALUES (?,?,1) ON CONFLICT(owner,viewer) DO UPDATE SET blocked=1,presence=0,stats=0,software=0,live=0,replay=0',
      )
        .bind(me, peer)
        .run();
      await q('DELETE FROM social_friends WHERE a=? AND b=?').bind(a, b).run();
      await q(
        'UPDATE social_access SET presence=0,stats=0,software=0,live=0,replay=0 WHERE owner=? AND viewer=?',
      )
        .bind(peer, me)
        .run();
    } else
      await q('UPDATE social_access SET blocked=0 WHERE owner=? AND viewer=?').bind(me, peer).run();
    return json({ ok: true });
  }
  if (await isBlocked(peer)) return json({ error: 'Profil indisponible.' }, 404);
  if (url.pathname === '/api/social/request') {
    if (!own) return json({ error: 'Enregistrez votre profil avant de demander un ami.' }, 409);
    const inserted = await q(`INSERT INTO social_friends(a,b,requester) SELECT ?,?,? WHERE
      EXISTS(SELECT 1 FROM social_profiles WHERE profile=? AND discoverable=1)
      AND NOT EXISTS(${blockedSQL})
      AND (SELECT COUNT(*) FROM social_friends WHERE a=? OR b=?)<50
      AND (SELECT COUNT(*) FROM social_friends WHERE a=? OR b=?)<50
      ON CONFLICT(a,b) DO NOTHING RETURNING a`)
      .bind(a, b, me, peer, me, peer, peer, me, me, me, peer, peer)
      .first();
    return inserted
      ? json({ ok: true })
      : json(
          {
            error:
              'Demande déjà existante, profil indisponible ou limite de 50 relations atteinte.',
          },
          409,
        );
  }
  if (url.pathname === '/api/social/accept') {
    const changed = await q(
      `UPDATE social_friends SET accepted=1 WHERE a=? AND b=? AND requester<>? AND accepted=0 AND NOT EXISTS(${blockedSQL}) RETURNING a`,
    )
      .bind(a, b, me, me, peer, peer, me)
      .first();
    return changed ? json({ ok: true }) : json({ error: 'Demande indisponible.' }, 409);
  }
  if (url.pathname === '/api/social/remove') {
    await q('DELETE FROM social_friends WHERE a=? AND b=?').bind(a, b).run();
    await q(
      'UPDATE social_access SET presence=0,stats=0,software=0,live=0,replay=0 WHERE (owner=? AND viewer=?) OR (owner=? AND viewer=?)',
    )
      .bind(me, peer, peer, me)
      .run();
    return json({ ok: true });
  }
  if (url.pathname === '/api/social/grant') {
    if (!['presence', 'stats', 'software'].every((k) => typeof body[k] === 'boolean'))
      return json({ error: 'Autorisations invalides.' }, 400);
    if (['live', 'replay'].some((k) => body[k] !== undefined && typeof body[k] !== 'boolean'))
      return json({ error: 'Autorisations invalides.' }, 400);
    const changed =
      await q(`INSERT INTO social_access(owner,viewer,presence,stats,software,live,replay) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM social_friends WHERE a=? AND b=? AND accepted=1) AND NOT EXISTS(${blockedSQL})
      ON CONFLICT(owner,viewer) DO UPDATE SET presence=excluded.presence,stats=excluded.stats,software=excluded.software,live=excluded.live,replay=excluded.replay RETURNING owner`)
        .bind(
          me,
          peer,
          +body.presence,
          +body.stats,
          +body.software,
          +!!body.live,
          +!!body.replay,
          a,
          b,
          me,
          peer,
          peer,
          me,
        )
        .first();
    return changed ? json({ ok: true }) : json({ error: 'Amitié requise.' }, 403);
  }
  return json({ error: 'Introuvable.' }, 404);
}
