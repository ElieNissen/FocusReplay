'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight, UserRound } from 'lucide-react';

export default function AccountHome() {
  const [account, setAccount] = useState<{ profile: string } | null>(null);
  const [loading, setLoading] = useState(true),
    [register, setRegister] = useState(false);
  const [email, setEmail] = useState(''),
    [profile, setProfile] = useState('');
  const [password, setPassword] = useState(''),
    [invitation, setInvitation] = useState('');
  const [inviteRequired, setInviteRequired] = useState<boolean | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [visitor, setVisitor] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/account/me', { cache: 'no-store' }).then(async (r) =>
        r.ok
          ? (r.json() as Promise<{ profile: string }>)
          : r.status === 401
            ? null
            : Promise.reject(Error('Connexion indisponible.')),
      ),
      fetch('/api/account/options', { cache: 'no-store' }).then(async (r) => {
        if (!r.ok) throw Error('Inscription indisponible.');
        return r.json() as Promise<{ invitationRequired: boolean }>;
      }),
    ])
      .then(([me, options]) => {
        if (active) {
          setAccount(me);
          setInviteRequired(options.invitationRequired);
        }
      })
      .catch(() => {
        if (active) setError('Impossible de joindre FocusReplay. Rechargez la page.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account/' + (register ? 'register' : 'login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          browser: true,
          password,
          invitation,
          ...(register
            ? { email, profile }
            : email.includes('@')
              ? { email }
              : { profile: email.trim().toLowerCase() }),
        }),
      });
      const value = (await response.json()) as { profile?: string; error?: string };
      if (!response.ok || !value.profile) throw Error(value.error || 'Connexion impossible.');
      setAccount({ profile: value.profile });
      setPassword('');
      setInvitation('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const visit = (
    <form
      className="visit-profile"
      onSubmit={(e) => {
        e.preventDefault();
        window.location.assign('/?profile=' + encodeURIComponent(visitor.trim().toLowerCase()));
      }}
    >
      <label htmlFor="visit-profile">Ouvrir un profil</label>
      <div>
        <Input
          id="visit-profile"
          placeholder="Pseudo"
          required
          pattern="[a-z0-9-]{1,48}"
          value={visitor}
          onChange={(e) => setVisitor(e.target.value.toLowerCase())}
        />
        <Button variant="outline" aria-label="Ouvrir le profil">
          <ArrowRight size={18} />
        </Button>
      </div>
    </form>
  );
  return (
    <main className="account-home">
      <header>
        <a href="/" className="wordmark">
          FocusReplay
        </a>
        <span>Vos journées, en replay.</span>
      </header>
      {loading ? (
        <p role="status">Connexion…</p>
      ) : account ? (
        <section className="account-welcome">
          <UserRound size={28} />
          <h1>Bonjour, {account.profile}</h1>
          <p>Retrouvez vos sessions partagées et votre activité.</p>
          <a
            className="account-primary-link"
            href={'/?profile=' + encodeURIComponent(account.profile)}
          >
            Mon profil <ArrowRight size={18} />
          </a>
          <p className="account-hint">
            Pour envoyer vos sessions, connectez le même compte dans l’application Windows et
            activez le partage.
          </p>
          {visit}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const r = await fetch('/api/account/logout', { method: 'POST' });
                if (!r.ok) throw Error('Déconnexion impossible.');
                setAccount(null);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Se déconnecter
          </Button>
        </section>
      ) : (
        <section className="account-entry">
          <h1>{register ? 'Créer un compte' : 'Se connecter'}</h1>
          <form onSubmit={submit}>
            <label htmlFor="account-email">
              {register ? 'Adresse e-mail' : 'E-mail ou identifiant'}
            </label>
            <Input
              id="account-email"
              type={register ? 'email' : 'text'}
              autoComplete="username"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {register && (
              <>
                <label htmlFor="account-profile">Pseudo</label>
                <Input
                  id="account-profile"
                  autoComplete="nickname"
                  required
                  pattern="[a-z0-9][a-z0-9-]{2,39}"
                  minLength={3}
                  maxLength={40}
                  value={profile}
                  onChange={(e) => setProfile(e.target.value.toLowerCase())}
                />
              </>
            )}
            <label htmlFor="account-password">Mot de passe</label>
            <Input
              id="account-password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={12}
              maxLength={128}
              placeholder={register ? '12 caractères minimum' : ''}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {register && inviteRequired && (
              <>
                <label htmlFor="account-invite">Code d’invitation de ce serveur</label>
                <Input
                  id="account-invite"
                  required
                  value={invitation}
                  onChange={(e) => setInvitation(e.target.value.trim())}
                />
              </>
            )}
            <Button disabled={busy || inviteRequired === null}>
              {busy ? 'Connexion…' : register ? 'Créer mon compte' : 'Se connecter'}
            </Button>
          </form>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setRegister(!register);
              setError('');
              setPassword('');
            }}
          >
            {register ? 'Déjà un compte ? Se connecter' : 'Créer un compte'}
          </Button>
          {visit}
        </section>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
