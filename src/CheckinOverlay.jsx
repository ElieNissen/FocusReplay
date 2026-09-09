import React, { useEffect, useState } from 'react';
import { X, Pause, Check, MessageCircle } from 'lucide-react';
import { useSoundDesign } from './sounds';
import { shortTime } from './lib.mjs';
import './styles.css';
const api = window.focusReplay;
export default function CheckinOverlay() {
  const [data, setData] = useState(null),
    [text, setText] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useSoundDesign(data?.settings);
  useEffect(() => {
    api
      .checkinState()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const theme = data?.settings.theme;
    document.documentElement.dataset.theme =
      theme === 'system'
        ? matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme || 'dark';
  }, [data?.settings.theme]);
  const p = data?.prompt;
  const submit = async (action) => {
    if (!p || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.checkinRespond(p.id, action, text);
    } catch (e) {
      setError(e.message.replace(/^Error invoking remote method '[^']+': Error: /, ''));
      setBusy(false);
    }
  };
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') submit('dismiss');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [p, text, busy]);
  return (
    <main className="checkin-overlay">
      <header>
        <span>
          <MessageCircle size={16} /> FocusReplay
        </span>
        <button aria-label="Plus tard" disabled={busy} onClick={() => submit('dismiss')}>
          <X size={17} />
        </button>
      </header>
      {p && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit('answer');
          }}
        >
          <h1>
            {p.kind === 'work'
              ? 'Sur quoi tu travailles ?'
              : p.kind === 'reason'
                ? 'Pourquoi tu t’es arrêté ?'
                : 'Qu’est-ce qui t’a fait décrocher ?'}
          </h1>
          {p.kind !== 'work' && (
            <p className="checkin-context">
              {p.kind === 'reason' ? 'Session en pause' : p.domain || p.app}
            </p>
          )}
          <textarea
            aria-label="Votre réponse"
            placeholder={
              p.kind === 'work' ? 'Ce que je fais…' : 'Une envie, un blocage, une interruption…'
            }
            maxLength={500}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {p.kind !== 'work' && (
            <div className="checkin-reasons">
              {['Fatigue', 'Notification', 'Blocage', 'Besoin de pause'].map((reason) => (
                <button type="button" key={reason} disabled={busy} onClick={() => setText(reason)}>
                  {reason}
                </button>
              ))}
            </div>
          )}
          <footer>
            {p.kind !== 'reason' ? (
              <button type="button" disabled={busy} onClick={() => submit('pause')}>
                <Pause size={14} /> J’ai arrêté de travailler
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => submit('dismiss')}>
                Passer
              </button>
            )}
            <button className="primary" disabled={busy || !text.trim()}>
              <Check size={15} /> Enregistrer
            </button>
          </footer>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
export function CheckinHistory({ entries, seek }) {
  const visible = entries.filter((e) => e.action !== 'dismiss');
  if (!visible.length) return null;
  return (
    <details className="checkin-history">
      <summary>Repères · {visible.length}</summary>
      {visible.map((e) => (
        <button key={e.id} onClick={() => seek(e.at)}>
          <time>{shortTime(e.at)}</time>
          <span>
            <strong>
              {e.action === 'pause'
                ? 'Arrêt du travail'
                : e.kind === 'work'
                  ? 'En cours'
                  : 'Interruption'}
            </strong>
            {e.text && <span>{e.text}</span>}
            <small>{e.domain || e.app}</small>
          </span>
        </button>
      ))}
    </details>
  );
}
