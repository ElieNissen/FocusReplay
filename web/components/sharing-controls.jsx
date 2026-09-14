import React from 'react';
import { Select, ListBox, Label, Switch, Chip } from '@heroui/react';
export const defaultSharing = {
  publicScreen: 'hidden',
  publicCamera: 'hidden',
  profileScreen: 'visible',
  profileCamera: 'hidden',
  publicSoftware: false,
};
export function VisibilitySelect({ label, value, onChange, disabled }) {
  return (
    <Select aria-label={label} value={value} onChange={onChange} isDisabled={disabled}>
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {[
            ['hidden', 'Masqué'],
            ['blurred', 'Flouté (détails supprimés)'],
            ['visible', 'Visible'],
          ].map(([id, text]) => (
            <ListBox.Item key={id} id={id} textValue={text}>
              {text}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
export function SharingControls({ value, onChange, disabled = false }) {
  const p = { ...defaultSharing, ...value.sharing };
  const change = (key, v) => onChange({ ...value, sharing: { ...p, [key]: v } });
  return (
    <div className="sharing-controls">
      <div className="sharing-status">
        <Chip color={value.discoverable && value.publicActivity ? 'success' : 'default'}>
          {value.discoverable && value.publicActivity
            ? 'Visible dans le fil et la Room'
            : 'Absent du fil et de la Room'}
        </Chip>
      </div>
      <Switch
        isSelected={!!value.discoverable}
        onChange={(v) => onChange({ ...value, discoverable: v })}
        isDisabled={disabled}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label>Être trouvable par mon pseudo</Label>
        </Switch.Content>
      </Switch>
      <Switch
        isSelected={!!value.publicActivity}
        onChange={(v) =>
          onChange({ ...value, publicActivity: v, discoverable: v || value.discoverable })
        }
        isDisabled={disabled}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label>Apparaître dans le fil et la Room avec mon activité</Label>
        </Switch.Content>
      </Switch>
      <section>
        <h3>Tout le monde</h3>
        <p>Visiteurs sans compte, fil et Room.</p>
        <div className="sharing-media-row">
          <VisibilitySelect
            label="Écran public"
            value={p.publicScreen}
            onChange={(v) => change('publicScreen', v)}
            disabled={disabled || !value.publicActivity}
          />
          <VisibilitySelect
            label="Caméra publique"
            value={p.publicCamera}
            onChange={(v) => change('publicCamera', v)}
            disabled={disabled || !value.publicActivity}
          />
        </div>
        <Switch
          isSelected={p.publicSoftware}
          onChange={(v) => change('publicSoftware', v)}
          isDisabled={disabled || !value.publicActivity}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Label>Afficher mon logiciel en cours publiquement</Label>
          </Switch.Content>
        </Switch>
      </section>
      <section>
        <h3>Profil autorisé</h3>
        <p>Mot de passe ou ami autorisé au live / replay.</p>
        <div className="sharing-media-row">
          <VisibilitySelect
            label="Écran du profil"
            value={p.profileScreen}
            onChange={(v) => change('profileScreen', v)}
            disabled={disabled}
          />
          <VisibilitySelect
            label="Caméra du profil"
            value={p.profileCamera}
            onChange={(v) => change('profileCamera', v)}
            disabled={disabled}
          />
        </div>
      </section>
      <p className="sharing-help">
        Le flou est intégré à une copie dégradée avant l’envoi. Les formes et couleurs restent
        perceptibles. Pour un contenu sensible, choisissez Masqué. La caméra nécessite aussi son
        autorisation d’enregistrement.
      </p>
    </div>
  );
}
