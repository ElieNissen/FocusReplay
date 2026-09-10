import React, { useState } from 'react';
import { ChevronLeft, ExternalLink, Link, X, Plus } from 'lucide-react';
import { dayKey, duration } from './lib.mjs';
const api = window.focusReplay;
export default function Profile({ data, busy, act, onBack }) {
  const [password, setPassword] = useState(''),
    [app, setApp] = useState(''),
    [domain, setDomain] = useState('');
  const share = data.share || {},
    settings = data.settings;
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
      <button className="text-button" onClick={onBack}>
        <ChevronLeft size={17} /> Retour au replay
      </button>
      <div className="page-heading">
        <h1>Profil</h1>
      </div>
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
        <h2>Partager mon replay</h2>
        {!share.connected ? (
          <button disabled={busy} onClick={() => act(() => api.shareConnect())}>
            <Link size={16} /> Connecter mon profil
          </button>
        ) : (
          <>
            <div className="profile-row">
              <button className="text-button" onClick={() => api.shareOpen()}>
                <ExternalLink size={16} /> Ouvrir mon profil en ligne
              </button>
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
              <button disabled={busy || password.length < 12}>
                {share.configured ? 'Changer' : 'Enregistrer'}
              </button>
            </form>
            {share.configured && (
              <button
                className={share.enabled ? '' : 'primary'}
                disabled={busy}
                onClick={() => act(() => api.shareEnable(!share.enabled))}
              >
                {share.enabled ? 'Arrêter et retirer le replay en ligne' : 'Activer le partage'}
              </button>
            )}
            {!share.enabled && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => act(() => api.shareConnect())}
              >
                Changer de connexion
              </button>
            )}
          </>
        )}
        <p className="profile-caption">
          Écran uniquement, avec une minute de retard. Jusqu’à 90 jours, avec des images
          progressivement espacées, environ 40 Mo. Caméra et réponses aux rappels exclues.
        </p>
        {share.lastSync > 0 && (
          <small>Dernier envoi à {new Date(share.lastSync).toLocaleTimeString('fr-FR')}</small>
        )}
        {share.error && <p role="alert">{share.error}</p>}
      </section>
      <section className="profile-privacy">
        <h2>Masquer dans le partage</h2>
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
              <button aria-label={'Masquer dans ' + label} disabled={busy || !value.trim()}>
                <Plus size={16} />
              </button>
            </form>
            <div className="profile-rules">
              {(settings[key] || []).map((rule) => (
                <button
                  key={rule}
                  disabled={busy}
                  title={'Ne plus masquer ' + rule}
                  onClick={() =>
                    update(
                      key,
                      settings[key].filter((v) => v !== rule),
                    )
                  }
                >
                  {rule}
                  <X size={14} />
                </button>
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
