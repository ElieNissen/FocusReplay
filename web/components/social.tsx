'use client';
import { useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Radio, Users, LayoutGrid, List, ArrowUpRight, Lock } from 'lucide-react';
const hours = (ms: number) =>
  (ms / 3600000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' h';
const status = (s: string) =>
  s === 'recording' ? 'En train de travailler' : s === 'paused' ? 'En pause' : 'Hors ligne';
async function api(path: string, body?: unknown) {
  const r = await fetch('/api/social' + path, {
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  const value: any = await r.json();
  if (!r.ok) throw Error(value.error || 'Connexion indisponible.');
  return value;
}

function PublicPreview({ profile, frames }: { profile: string; frames: any[] }) {
  const ref = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false),
    [images, setImages] = useState<any[]>([]),
    [index, setIndex] = useState(0);
  const key = frames.map((f) => f.id).join(',');
  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setVisible(true);
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setImages([]);
    setIndex(0);
    if (!visible || !frames.length) return;
    const controller = new AbortController();
    let urls: string[] = [],
      active = true;
    Promise.all(
      frames.slice(-6).map(async (f) => {
        const r = await fetch('/api/social/preview/' + profile + '/' + f.id, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!r.ok) throw Error();
        const blob = await r.blob();
        if (!active || blob.size > 50000) throw Error();
        const url = URL.createObjectURL(blob);
        urls.push(url);
        return { url, at: f.at };
      }),
    )
      .then((list) => {
        if (active) setImages(list);
      })
      .catch(() => {
        if (active) setImages([]);
      });
    return () => {
      active = false;
      controller.abort();
      urls.forEach(URL.revokeObjectURL);
    };
  }, [profile, key, visible]);
  useEffect(() => {
    if (!images.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % images.length);
    }, 1800);
    return () => clearInterval(t);
  }, [images]);
  const image = images[index];
  return (
    <div ref={ref} className={'public-preview ' + (image ? '' : 'private-placeholder')}>
      {image ? (
        <>
          <img src={image.url} alt="Aperçu public autorisé" />
          <span>
            Replay récent ·{' '}
            {new Date(image.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </>
      ) : (
        <>
          <div className="placeholder-lines" aria-hidden="true" />
          <span>
            <Lock size={16} />
            Aperçu privé
          </span>
        </>
      )}
    </div>
  );
}

export function Discover() {
  const [items, setItems] = useState<any[]>([]),
    [grid, setGrid] = useState(false),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true,
      pending = false;
    const refresh = async () => {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const r = await api('/discover?offset=' + offset);
        if (active) {
          setItems(r.items);
          setMore(r.more);
          setError('');
        }
      } catch (e: any) {
        if (active) setError(e.message);
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    setLoading(true);
    refresh();
    const timer = setInterval(refresh, 180000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [offset]);
  return (
    <section className="discover" aria-label="Découvrir les personnes qui travaillent">
      <div className="social-heading">
        <div>
          <h1>On travaille ensemble</h1>
          <p>En direct et dernières sessions partagées</p>
        </div>
        <div className="social-buttons">
          <Button variant="outline" aria-pressed={!grid} onClick={() => setGrid(false)}>
            <List size={16} />
            Fil
          </Button>
          <Button variant="outline" aria-pressed={grid} onClick={() => setGrid(true)}>
            <LayoutGrid size={16} />
            Room
          </Button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Chargement…</p>}
      {!loading && !error && !items.length && (
        <p className="social-empty">
          La room est calme. Les profils qui choisissent de partager leur activité apparaîtront ici.
        </p>
      )}
      <div className={grid ? 'public-room' : 'public-feed'}>
        {items.map((p) => (
          <article className="social-post" key={p.profile}>
            <div className="social-post-top">
              <span className="social-avatar" aria-hidden="true">
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong>{p.name}</strong>
                <small>@{p.profile}</small>
              </div>
              <span className={'social-status ' + p.status}>
                <Radio size={13} />
                {status(p.status)}
              </span>
            </div>
            <PublicPreview profile={p.profile} frames={p.previews || []} />
            <div className="post-stats">
              <strong>{hours(p.session?.workMs || 0)}</strong>
              <span>
                {p.session?.endedAt
                  ? 'Dernière session terminée'
                  : p.status === 'offline'
                    ? 'Dernière session'
                    : 'Session en cours'}{' '}
                · travail probable
              </span>
            </div>
            {p.session?.endedAt && (
              <time>
                {new Date(p.session.endedAt).toLocaleString('fr-FR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </time>
            )}
            <small>
              {p.updated
                ? 'Statut reçu à ' +
                  new Date(p.updated).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Aucune session partagée'}
            </small>
            <div className="week-bars" aria-label="Activité des derniers jours">
              {p.days.map((d: any) => (
                <span
                  key={d.day}
                  title={d.day + ' · ' + hours(d.workMs)}
                  style={{ height: Math.max(3, Math.min(36, (d.workMs / 3600000) * 6)) }}
                />
              ))}
            </div>
            <a className="social-open" href={'/?profile=' + encodeURIComponent(p.profile)}>
              <Lock size={14} />
              Ouvrir le replay privé
              <ArrowUpRight size={14} />
            </a>
            <small>Mot de passe ou autorisation d’ami.</small>
          </article>
        ))}
      </div>
      <div className="social-buttons">
        <Button
          variant="ghost"
          disabled={!offset}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          Précédent
        </Button>
        <Button variant="ghost" disabled={!more} onClick={() => setOffset(offset + 20)}>
          Suivant
        </Button>
      </div>
    </section>
  );
}
export default function Social({ profile }: { profile: string }) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('discover');
  const [name, setName] = useState(profile),
    [discoverable, setDiscoverable] = useState(false),
    [publicActivity, setPublicActivity] = useState(false),
    [publicPreview, setPublicPreview] = useState(false),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<any[]>([]);
  const refresh = async () => {
    const r = await api('');
    setData(r);
    return r;
  };
  useEffect(() => {
    let active = true;
    api('')
      .then((r) => {
        if (active) {
          setData(r);
          setName(r.me.name);
          setDiscoverable(Boolean(r.me.discoverable));
          setPublicActivity(Boolean(r.me.public_activity));
          setPublicPreview(Boolean(r.me.public_preview));
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && tab === 'friends') refresh().catch((e) => setError(e.message));
    }, 180000);
    return () => clearInterval(timer);
  }, [tab]);
  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="social-network">
      <nav className="social-tabs" aria-label="Réseau">
        <Button
          variant={tab === 'discover' ? 'default' : 'ghost'}
          onClick={() => setTab('discover')}
        >
          Découvrir
        </Button>
        <Button variant={tab === 'friends' ? 'default' : 'ghost'} onClick={() => setTab('friends')}>
          <Users size={16} />
          Amis {data?.peers.filter((p: any) => p.relationship === 'incoming').length || ''}
        </Button>
        <Button
          variant={tab === 'settings' ? 'default' : 'ghost'}
          onClick={() => setTab('settings')}
        >
          Mon partage
        </Button>
        <a href={'/?profile=' + profile}>Mon replay</a>
      </nav>
      {error && <p role="alert">{error}</p>}
      {tab === 'discover' && <Discover />}
      {tab === 'settings' && (
        <form
          className="social-settings"
          onSubmit={(e) => {
            e.preventDefault();
            act(() => api('/profile', { name, discoverable, publicActivity, publicPreview }));
          }}
        >
          <h2>Mon profil dans le réseau</h2>
          <label>
            Nom affiché
            <Input value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={discoverable}
              onChange={(e) => setDiscoverable(e.target.checked)}
            />
            Être trouvable par mon pseudo
          </label>
          <label>
            <input
              type="checkbox"
              disabled={!discoverable}
              checked={discoverable && publicActivity}
              onChange={(e) => setPublicActivity(e.target.checked)}
            />
            Publier mon statut et mes statistiques dans Découvrir et la Room, visibles par tous
          </label>
          <label>
            <input
              type="checkbox"
              disabled={!discoverable || !publicActivity}
              checked={discoverable && publicActivity && publicPreview}
              onChange={(e) => setPublicPreview(e.target.checked)}
            />
            Autoriser un aperçu public de 6 captures récentes, retardées d’au moins 5 minutes
          </label>
          <p>
            Sans cette option, le fil affiche un aperçu privé sans vos images. Les règles de
            masquage restent appliquées.
          </p>
          <Button disabled={busy}>Enregistrer le profil</Button>
          {data?.blocks.length > 0 && (
            <div>
              <h3>Profils bloqués</h3>
              {data.blocks.map((p: any) => (
                <Button
                  type="button"
                  key={p.profile}
                  variant="outline"
                  disabled={busy}
                  onClick={() => act(() => api('/block', { peer: p.profile, blocked: false }))}
                >
                  Débloquer @{p.profile}
                </Button>
              ))}
            </div>
          )}
        </form>
      )}
      {tab === 'friends' && (
        <div className="friends-view">
          <form
            className="friend-search"
            onSubmit={(e) => {
              e.preventDefault();
              act(async () =>
                setResults((await api('/search?q=' + encodeURIComponent(query))).items),
              );
            }}
          >
            <label htmlFor="friend-query">Trouver quelqu’un par son pseudo</label>
            <div>
              <Input
                id="friend-query"
                value={query}
                minLength={2}
                maxLength={40}
                required
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button disabled={busy}>Rechercher</Button>
            </div>
          </form>
          {results.map((p) => (
            <div className="friend-result" key={p.profile}>
              <span>
                {p.name} · @{p.profile}
              </span>
              <Button
                disabled={busy || data?.peers.some((a: any) => a.profile === p.profile)}
                onClick={() => act(() => api('/request', { peer: p.profile }))}
              >
                Demander en ami
              </Button>
            </div>
          ))}
          {!data?.peers.length && (
            <p className="social-empty">
              Vos amis et demandes apparaîtront ici. Enregistrez d’abord votre profil dans « Mon
              partage ».
            </p>
          )}
          {data?.peers.map((p: any) => (
            <article className="friend-row" key={p.profile}>
              <div className="social-post-top">
                <strong>{p.name}</strong>
                <small>@{p.profile}</small>
                <span>
                  {p.relationship === 'incoming'
                    ? 'Demande reçue'
                    : p.relationship === 'outgoing'
                      ? 'Demande envoyée'
                      : p.status
                        ? status(p.status)
                        : 'Statut privé'}
                </span>
              </div>
              {p.days && (
                <p>
                  {hours(p.days.reduce((n: number, d: any) => n + d.workMs, 0))} partagées sur{' '}
                  {p.days.length} jours
                </p>
              )}
              {p.software && <p>{p.software}</p>}
              {p.relationship === 'incoming' && (
                <Button
                  disabled={busy}
                  onClick={() => act(() => api('/accept', { peer: p.profile }))}
                >
                  Accepter
                </Button>
              )}
              {p.relationship === 'friend' && (
                <fieldset>
                  <legend>Ce que @{p.profile} peut voir de mon activité</legend>
                  {[
                    ['presence', 'Statut live / pause'],
                    ['stats', 'Statistiques'],
                    ['software', 'Logiciel récent'],
                    ['live', 'Captures de la session en cours'],
                    ['replay', 'Captures des sessions passées'],
                  ].map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={p.grants[key]}
                        onChange={(e) =>
                          act(() =>
                            api('/grant', {
                              peer: p.profile,
                              ...p.grants,
                              [key]: e.target.checked,
                            }),
                          )
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <small>
                    Ces accès sont révocables. Le mot de passe du profil reste utilisable pour les
                    invités.
                  </small>
                </fieldset>
              )}
              <div className="social-buttons">
                <a href={'/?profile=' + p.profile}>Replay privé</a>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act(() => api('/remove', { peer: p.profile }))}
                >
                  {p.relationship === 'friend'
                    ? 'Retirer cet ami'
                    : p.relationship === 'incoming'
                      ? 'Refuser'
                      : 'Annuler la demande'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act(() => api('/block', { peer: p.profile, blocked: true }))}
                >
                  Bloquer
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
