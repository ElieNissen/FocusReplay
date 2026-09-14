import { Button } from '@heroui/react';
import React, { useState, useEffect } from 'react';
import { Chip } from '@heroui/react';
import { SharingControls, defaultSharing } from './SharingControls';
import { ChevronLeft, ExternalLink, Link, X, Plus } from 'lucide-react';
import { dayKey, duration } from './lib.mjs';
const api = window.focusReplay;
const commonServer = 'https://focusreplay-private.hushed-plume-0999.chatgpt.site';
export default function Profile({ data, busy, act, onBack }) {
  const [password, setPassword] = useState(''),
    [app, setApp] = useState(''),
    [domain, setDomain] = useState('');
  const [connecting, setConnecting] = useState(false),
    [register, setRegister] = useState(false),
    [address, setAddress] = useState(
      data.share?.url ? new URL(data.share.url).origin : commonServer,
    ),
    [email, setEmail] = useState(''),
    [profile, setProfile] = useState(''),
    [accountPassword, setAccountPassword] = useState(''),
    [invitation, setInvitation] = useState('');
  const share = data.share || {},
    settings = data.settings;
  const [social, setSocial] = useState(null),
    [socialError, setSocialError] = useState(''),
    [saved, setSaved] = useState(false),
    [filter, setFilter] = useState('');
  useEffect(() => {
    if (!share.connected) return;
    let active = true;
    api
      .shareSocial()
      .then((r) => {
        if (active)
          setSocial({
            name: r.me.name,
            discoverable: !!r.me.discoverable,
            publicActivity: !!r.me.public_activity,
            sharing: r.me.sharing || defaultSharing,
          });
      })
      .catch((e) => active && setSocialError(e.message));
    return () => {
      active = false;
    };
  }, [share.connected]);
  const days = Array.from({ length: 364 }, (_, i) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - 363 + i);
    const day = dayKey(d.getTime());
    return { day, ms: data.activityDays?.[day] || 0 };
  });
  const update = (key, value) => act(() => api.settings({ [key]: value }));
  const add = (key, value, clear) => {
    const clean = value.trim().toLowerCase();
    if (!clean) return;
    act(async () => {
      await api.settings({ [key]: [...new Set([...(settings[key] || []), clean])] });
      clear('');
    });
  };
  return (
    <section className="settings-page profile-page">
      <Button variant="ghost" type="submit" className="text-button" onPress={onBack}>
        <ChevronLeft size={17} /> Retour au replay
      </Button>
      <div className="page-heading">
        <h1>Profil</h1>
      </div>
      <Button
        variant="ghost"
        type="submit"
        className="text-button"
        isDisabled={busy}
        onPress={() => act(() => api.shareBrowse())}
      >
        <ExternalLink size={16} /> Consulter un profil sans compte
      </Button>
      <section className="profile-activity">
        <h2>{duration(days.reduce((n, d) => n + d.ms, 0))} de travail</h2>
        <div className="profile-calendar" aria-label="Activité des douze derniers mois">
          {days.map((d) => (
            <span
              key={d.day}
              title={d.day + ' · ' + duration(d.ms)}
              aria-label={d.day + ' : ' + duration(d.ms)}
              data-level={
                d.ms >= 4 * 3600000
                  ? 4
                  : d.ms >= 2 * 3600000
                    ? 3
                    : d.ms >= 3600000
                      ? 2
                      : d.ms > 0
                        ? 1
                        : 0
              }
            />
          ))}
        </div>
        <small>12 derniers mois · une case par jour</small>
      </section>
      <section className="profile-sharing">
        <h2>Mon compte FocusReplay</h2>
        {!share.connected || connecting ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api.shareLogin({
                  url: address,
                  profile,
                  email: register || email.includes('@') ? email : undefined,
                  password: accountPassword,
                  invitation,
                  register,
                  ...(!register && !email.includes('@')
                    ? { profile: email.trim().toLowerCase() }
                    : {}),
                });
                setAccountPassword('');
                setInvitation('');
                setConnecting(false);
              });
            }}
          >
            <div className="profile-row">
              <Button
                variant="tertiary"
                type="button"
                aria-pressed={!register}
                onPress={() => setRegister(false)}
              >
                Se connecter
              </Button>
              <Button
                variant="tertiary"
                type="button"
                aria-pressed={register}
                onPress={() => setRegister(true)}
              >
                Créer mon compte
              </Button>
            </div>
            <div className="profile-row">
              <label>
                {register ? 'Adresse e-mail' : 'E-mail ou identifiant'}
                <input
                  type={register ? 'email' : 'text'}
                  autoComplete="username"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {register && (
                <label>
                  Pseudo
                  <input
                    autoComplete="nickname"
                    required
                    pattern="[a-z0-9][a-z0-9-]{2,39}"
                    value={profile}
                    onChange={(e) => setProfile(e.target.value.toLowerCase())}
                  />
                </label>
              )}
            </div>
            <div className="profile-row">
              <label>
                Mot de passe du compte
                <input
                  type="password"
                  autoComplete={register ? 'new-password' : 'current-password'}
                  required
                  minLength={12}
                  maxLength={128}
                  value={accountPassword}
                  onChange={(e) => setAccountPassword(e.target.value)}
                />
              </label>
              {register && address !== commonServer && (
                <label>
                  Code d’invitation
                  <input
                    value={invitation}
                    onChange={(e) => setInvitation(e.target.value.trim())}
                  />
                </label>
              )}
            </div>
            <details>
              <summary>Serveur personnalisé</summary>
              <label>
                Adresse du serveur
                <input
                  type="url"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <Button
                variant="ghost"
                type="button"
                className="text-button"
                onPress={() => {
                  setAddress(commonServer);
                  setInvitation('');
                }}
              >
                Utiliser FocusReplay
              </Button>
            </details>
            <Button variant="primary" type="submit" className="primary" isDisabled={busy}>
              {busy ? 'Connexion…' : register ? 'Créer mon compte' : 'Se connecter'}
            </Button>
            {share.connected && (
              <Button variant="tertiary" type="button" onPress={() => setConnecting(false)}>
                Annuler
              </Button>
            )}
          </form>
        ) : (
          <>
            <div className="profile-row">
              <Button
                variant="ghost"
                type="submit"
                className="text-button"
                onPress={() => api.shareOpen()}
              >
                <ExternalLink size={16} /> Ouvrir mon profil en ligne
              </Button>
              <span>
                {share.pendingRemoval
                  ? 'Retrait en attente'
                  : share.enabled
                    ? 'Partage activé'
                    : 'Partage arrêté'}
              </span>
            </div>
            <form
              className="profile-row"
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  await api.shareConfigure(password);
                  setPassword('');
                });
              }}
            >
              <label>
                Mot de passe du partage
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  value={password}
                  placeholder="12 caractères minimum"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <Button variant="tertiary" type="submit" isDisabled={busy || password.length < 12}>
                {share.configured ? 'Changer' : 'Enregistrer'}
              </Button>
            </form>
            {share.configured && (
              <Button
                variant="primary"
                type="submit"
                className={share.enabled ? '' : 'primary'}
                isDisabled={busy}
                onPress={() => act(() => api.shareEnable(!share.enabled))}
              >
                {share.enabled ? 'Arrêter et retirer le replay en ligne' : 'Activer le partage'}
              </Button>
            )}
            {!share.enabled && (
              <Button
                variant="ghost"
                type="submit"
                className="text-button"
                isDisabled={busy}
                onPress={() => setConnecting(true)}
              >
                Changer de connexion
              </Button>
            )}
          </>
        )}
        {share.connected && (
          <section className="audience-settings">
            <h2>Ce que les autres voient</h2>
            {social ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    await api.shareSocial({
                      ...social,
                      publicPreview: social.sharing.publicScreen !== 'hidden',
                    });
                    setSaved(true);
                  });
                }}
              >
                <SharingControls
                  value={social}
                  onChange={(v) => {
                    setSocial(v);
                    setSaved(false);
                  }}
                  disabled={busy}
                />
                <Button variant="primary" type="submit" className="primary" isDisabled={busy}>
                  Enregistrer le partage
                </Button>
                {saved && (
                  <p role="status">
                    Visibilité enregistrée. Les images disponibles sont synchronisées.
                  </p>
                )}
              </form>
            ) : (
              <p>{socialError || 'Chargement des autorisations…'}</p>
            )}
          </section>
        )}
        {share.lastSync > 0 && (
          <small>Dernier envoi à {new Date(share.lastSync).toLocaleTimeString('fr-FR')}</small>
        )}
        {share.error && <p role="alert">{share.error}</p>}
      </section>
      <section className="profile-privacy">
        <h2>Contenus masqués</h2>
        <p>Ces règles masquent l’écran et la caméra associés, pour tous les visiteurs.</p>
        <label>
          Rechercher un logiciel ou un site
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Nom ou domaine"
          />
        </label>
        <div className="privacy-inventory">
          {[
            [
              'privateApps',
              'Logiciel',
              ...new Set([
                ...settings.privateApps,
                ...data.sessions.flatMap((s) => s.activity.map((a) => a.app.toLowerCase())),
              ]),
            ],
            [
              'privateDomains',
              'Site',
              ...new Set([
                ...settings.privateDomains,
                ...data.sessions.flatMap((s) => s.activity.map((a) => a.domain).filter(Boolean)),
              ]),
            ],
          ].flatMap(([key, kind, ...values]) =>
            values
              .filter((v) => v.includes(filter.toLowerCase()))
              .map((value) => {
                const parent =
                  key === 'privateDomains' &&
                  settings.privateDomains.find((d) => value === d || value.endsWith('.' + d));
                const masked = !!parent || settings[key].includes(value);
                const automatic =
                  key === 'privateApps' &&
                  /1password|bitwarden|keepass|lastpass|dashlane|credential/i.test(value);
                return (
                  <div className="privacy-item" key={key + value}>
                    <div>
                      <strong>{value}</strong>
                      <small>
                        {kind}
                        {parent && parent !== value ? ' · règle ' + parent : ''}
                      </small>
                    </div>
                    <Chip color={masked || automatic ? 'warning' : 'success'}>
                      {automatic ? 'Protection automatique' : masked ? 'Masqué' : 'Autorisé'}
                    </Chip>
                    <Button
                      variant="tertiary"
                      type="button"
                      isDisabled={busy || automatic}
                      onPress={() =>
                        update(
                          key,
                          masked
                            ? settings[key].filter((v) => v !== (parent || value))
                            : [...settings[key], value],
                        )
                      }
                    >
                      {masked ? 'Démasquer' : 'Masquer'}
                    </Button>
                  </div>
                );
              }),
          )}
        </div>
        {data.sessions.flatMap((s) => s.frames).some((f) => f.private) && (
          <details>
            <summary>Captures masquées une par une</summary>
            {data.sessions
              .flatMap((s) => s.frames)
              .filter((f) => f.private)
              .map((f) => (
                <div className="privacy-item" key={f.id}>
                  <span>
                    {new Date(f.at).toLocaleString('fr-FR')} · {f.app}
                  </span>
                  <Button
                    variant="tertiary"
                    type="button"
                    isDisabled={busy}
                    onPress={() => act(() => api.shareMask(f.id, false))}
                  >
                    Démasquer cette capture
                  </Button>
                </div>
              ))}
          </details>
        )}
        {[
          ['privateApps', 'Logiciels', app, setApp, 'Ex. Notion'],
          ['privateDomains', 'Sites', domain, setDomain, 'Ex. mail.google.com'],
        ].map(([key, label, value, setValue, placeholder]) => (
          <div key={key}>
            <form
              className="profile-row"
              onSubmit={(e) => {
                e.preventDefault();
                add(key, value, setValue);
              }}
            >
              <label>
                {label}
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder}
                  maxLength={100}
                  list={key === 'privateApps' ? 'known-share-apps' : undefined}
                />
              </label>
              <Button
                variant="tertiary"
                type="submit"
                aria-label={'Masquer dans ' + label}
                isDisabled={busy || !value.trim()}
              >
                <Plus size={16} />
              </Button>
            </form>
            <div className="profile-rules">
              {(settings[key] || []).map((rule) => (
                <Button
                  variant="tertiary"
                  type="submit"
                  key={rule}
                  isDisabled={busy}
                  title={'Ne plus masquer ' + rule}
                  onPress={() =>
                    update(
                      key,
                      settings[key].filter((v) => v !== rule),
                    )
                  }
                >
                  {rule}
                  <X size={14} />
                </Button>
              ))}
            </div>
          </div>
        ))}
        <datalist id="known-share-apps">
          {[...new Set(data.sessions.flatMap((s) => s.activity.map((a) => a.app)))]
            .sort()
            .map((a) => (
              <option key={a} value={a} />
            ))}
        </datalist>
        <p className="profile-caption">
          Si un site est masqué et que son domaine est inconnu, le navigateur est masqué. Les champs
          de mot de passe détectables sont masqués au mieux : vérifiez les applications sensibles
          avant de partager. Une image déjà consultée peut avoir été copiée.
        </p>
      </section>
    </section>
  );
}
