import React, { useState } from 'react';
import { Button, Popover } from '@heroui/react';
import { Eye, EyeOff, X } from 'lucide-react';
export default function CapturePrivacy({ frame, settings, busy, act }) {
  const [open, setOpen] = useState(false);
  const app = (frame.app || '').toLowerCase(),
    domain = (frame.domain || '').toLowerCase();
  const rules = [
    ...(settings.privateApps || []).filter((v) => v === app).map((v) => ['privateApps', v]),
    ...(settings.privateDomains || [])
      .filter((v) => domain === v || domain.endsWith('.' + v))
      .map((v) => ['privateDomains', v]),
  ];
  return (
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className="button button--secondary preview-privacy-action"
        aria-label="Visibilité de cette capture"
      >
        {frame.sharedPrivate ? <EyeOff size={16} /> : <Eye size={16} />}{' '}
        {frame.sharedPrivate ? 'Masqué en ligne' : 'Partage'}
      </Popover.Trigger>
      <Popover.Content className="capture-privacy-menu">
        <Popover.Dialog>
          <div className="context-heading"><Popover.Heading>Visibilité du partage</Popover.Heading><Button isIconOnly size="sm" variant="ghost" aria-label="Fermer le menu de partage" onPress={()=>setOpen(false)}><X size={16}/></Button></div>
          <p>
            {(frame.privacyReasons || []).join(' · ') ||
              'Cette capture suit les autorisations de votre profil.'}
          </p>
          <Button
            variant="secondary"
            isDisabled={busy}
            onPress={() => act(() => window.focusReplay.shareMask(frame.id, !frame.private))}
          >
            {frame.private ? 'Démasquer cette capture' : 'Masquer cette capture'}
          </Button>
          {rules.map(([key, value]) => (
            <Button
              key={key + value}
              variant="secondary"
              isDisabled={busy}
              onPress={() =>
                act(() =>
                  window.focusReplay.settings({ [key]: settings[key].filter((v) => v !== value) }),
                )
              }
            >
              Démasquer {value}
            </Button>
          ))}
          {rules.length > 0 && (
            <small>
              Retire la règle pour ce logiciel ou site dans toutes les sessions partagées.
            </small>
          )}
          {frame.sharedPrivate && !frame.private && !rules.length && (
            <small>
              Protection automatique ou proximité d’une capture masquée. Les contenus sensibles
              restent protégés.
            </small>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
