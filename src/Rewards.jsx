import { Button } from '@heroui/react';
import React, { useState } from 'react';
import { Gift, Plus, Check, Pencil, Trash2, Coffee, ChevronLeft, ArrowRight } from 'lucide-react';
import { duration } from './lib.mjs';
import { Toggle } from './Toggle';

const blank = { name: '', minutes: 5, cost: 25 };
export function BreakBanner({ wallet, pauseTimer, clock, act, onResume }) {
  const reward = pauseTimer || wallet?.activeBreak;
  if (!reward) return null;
  const remaining = reward.notified ? 0 : Math.max(0, reward.endsAt - clock);
  return (
    <div className="notice break-banner" role="status">
      <Coffee size={20} />
      <span>
        <strong>{reward.name}</strong>
        <small>
          {!reward.endsAt
            ? 'Reprenez quand vous le souhaitez. Écran et caméra en pause.'
            : remaining
              ? `${duration(remaining)} restantes · écran et caméra en pause`
              : 'Le temps prévu est écoulé. Reprenez quand vous êtes prêt.'}
        </small>
      </span>
      <Button
        variant="tertiary"
        type="submit"
        onPress={() =>
          onResume
            ? onResume()
            : act(() =>
                pauseTimer ? window.focusReplay.pause() : window.focusReplay.finishBreak(),
              )
        }
      >
        {pauseTimer ? 'Reprendre maintenant' : remaining ? 'Terminer la pause' : 'J’ai terminé'}
      </Button>
    </div>
  );
}
export function Rewards({ data, clock, act, busy, onBack }) {
  const [edit, setEdit] = useState(null),
    [redeem, setRedeem] = useState(null),
    [remove, setRemove] = useState(null);
  const api = window.focusReplay,
    wallet = data.wallet,
    settings = data.settings,
    balance = Math.max(0, Math.floor(wallet.earned - wallet.spent + 1e-8));
  const next = [...wallet.rewards].sort((a, b) => a.cost - b.cost).find((r) => r.cost > balance);
  return (
    <div className="settings-page rewards-page">
      <Button variant="ghost" type="submit" className="text-button" onPress={onBack}>
        <ChevronLeft size={17} /> Retour au replay
      </Button>
      <div className="page-heading">
        <div>
          <h1>Pauses & récompenses</h1>
        </div>
      </div>
      <Toggle
        label="Activer les récompenses"
        aria-label="Activer les récompenses"
        className="toggle"
        type="checkbox"
        checked={settings.rewardsEnabled}
        onChange={(e) => act(() => api.settings({ rewardsEnabled: e.target.checked }))}
      />
      <div className="wallet-line">
        <span className="wallet-icon">
          <Gift size={26} />
        </span>
        <div>
          <strong>
            {balance}
            <small> min de travail disponibles</small>
          </strong>
          <p>{duration(wallet.workMs)} comptabilisées depuis l’activation.</p>
        </div>
        {next && (
          <span className="next-reward">
            Encore {next.cost - balance} min de travail pour
            <br />
            <strong>{next.name}</strong>
          </span>
        )}
      </div>
      <section className="settings-section">
        <label className="setting-row">
          <span>
            <strong>Temps comptabilisé</strong>
          </span>
          <select
            aria-label="Temps comptabilisé"
            value={settings.earnMode}
            onChange={(e) => act(() => api.settings({ earnMode: e.target.value }))}
          >
            <option value="work">Travail probable uniquement</option>
            <option value="active">Toute activité hors inactivité</option>
          </select>
        </label>
      </section>
      <div className="milestones" aria-label="Paliers de travail">
        {[25, 60, 120, 240, 480].map((minutes) => (
          <span key={minutes} className={wallet.workMs >= minutes * 60000 ? 'achieved' : ''}>
            {wallet.workMs >= minutes * 60000 && <Check size={14} />}
            {duration(minutes * 60000)}
          </span>
        ))}
        {wallet.milestone > 0 && (
          <strong>Bien joué · {duration(wallet.milestone * 60000)} de travail !</strong>
        )}
      </div>
      <section className="reward-section">
        <div className="section-title">
          <h2>À vous de choisir</h2>
          <Button
            variant="tertiary"
            type="submit"
            onPress={() => {
              setEdit({ ...blank });
              setRedeem(null);
            }}
          >
            <Plus size={16} /> Ajouter
          </Button>
        </div>
        <div className="reward-list">
          {wallet.rewards.map((r) => (
            <div className="reward-row" key={r.id}>
              <div className="reward-description">
                <strong>{r.name}</strong>
                <small>
                  {r.cost} min de travail → {r.minutes} min de récompense
                </small>
              </div>
              <div className="reward-progress">
                <progress value={Math.min(balance, r.cost)} max={r.cost} />
                <small>
                  {balance >= r.cost
                    ? 'Disponible'
                    : `${r.cost - balance} min de travail restantes`}
                </small>
              </div>
              <Button
                variant="tertiary"
                type="submit"
                isDisabled={
                  !settings.rewardsEnabled ||
                  balance < r.cost ||
                  Boolean(wallet.activeBreak) ||
                  busy
                }
                onPress={() => {
                  setRedeem(r);
                  setEdit(null);
                }}
              >
                <Coffee size={15} /> En profiter
              </Button>
              <Button
                variant="ghost"
                type="submit"
                className="icon-button"
                aria-label={`Modifier ${r.name}`}
                onPress={() => setEdit({ ...r })}
              >
                <Pencil size={16} />
              </Button>
              <Button
                variant="ghost"
                type="submit"
                className="icon-button"
                aria-label={`Supprimer ${r.name}`}
                onPress={() => setRemove(r)}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>

        {redeem && (
          <div className="notice">
            <span>
              Utiliser {redeem.cost} minutes de travail pour {redeem.minutes} minutes de «{' '}
              {redeem.name} » ? La session sera mise en pause.
            </span>
            <Button variant="tertiary" type="submit" onPress={() => setRedeem(null)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              type="submit"
              className="primary"
              isDisabled={busy}
              onPress={() =>
                act(async () => {
                  await api.redeemReward(redeem.id);
                  setRedeem(null);
                })
              }
            >
              <Check size={15} /> Commencer la pause
            </Button>
          </div>
        )}
        {remove && (
          <div className="notice">
            <span>
              Supprimer « {remove.name} » de vos récompenses ? Votre temps cumulé est conservé.
            </span>
            <Button variant="tertiary" type="submit" onPress={() => setRemove(null)}>
              Garder
            </Button>
            <Button
              variant="tertiary"
              type="submit"
              isDisabled={busy}
              onPress={() =>
                act(async () => {
                  await api.deleteReward(remove.id);
                  setRemove(null);
                })
              }
            >
              Supprimer
            </Button>
          </div>
        )}
        {edit && (
          <form
            className="reward-editor"
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api.saveReward({
                  ...edit,
                  minutes: Number(edit.minutes),
                  cost: Number(edit.cost),
                });
                setEdit(null);
              });
            }}
          >
            <h2>{edit.id ? 'Modifier la récompense' : 'Une nouvelle récompense'}</h2>
            <div className="export-fields">
              <label>
                Nom
                <input
                  autoFocus
                  aria-label="Nom de la récompense"
                  required
                  maxLength={80}
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  placeholder="Une promenade, un épisode…"
                />
              </label>
              <label>
                Durée, en minutes
                <input
                  aria-label="Durée de la récompense"
                  type="number"
                  min="1"
                  max="1440"
                  required
                  value={edit.minutes}
                  onChange={(e) => setEdit({ ...edit, minutes: e.target.value })}
                />
              </label>
              <label>
                Minutes de travail nécessaires
                <input
                  aria-label="Minutes de travail nécessaires"
                  type="number"
                  min="1"
                  max="100000"
                  required
                  value={edit.cost}
                  onChange={(e) => setEdit({ ...edit, cost: e.target.value })}
                />
              </label>
              <Button variant="tertiary" type="button" onPress={() => setEdit(null)}>
                Annuler
              </Button>
              <Button variant="primary" type="submit" className="primary" isDisabled={busy}>
                Enregistrer
              </Button>
            </div>
          </form>
        )}
      </section>
      {wallet.redemptions.length > 0 && (
        <section className="reward-history">
          <h2>Les pauses que vous vous êtes offertes</h2>
          {[...wallet.redemptions]
            .reverse()
            .slice(0, 6)
            .map((r, i) => (
              <div key={i}>
                <span>{r.name}</span>
                <small>
                  {r.minutes} min · {r.cost} min travaillées ·{' '}
                  {new Date(r.at).toLocaleDateString('fr-FR')}
                </small>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
