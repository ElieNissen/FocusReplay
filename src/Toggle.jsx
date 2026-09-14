import React, { useState } from 'react';
import { Switch, Label } from '@heroui/react';
export function Toggle({ checked, onChange, disabled, label, className, type, ...props }) {
  const [optimistic, setOptimistic] = useState(null);
  return (
    <Switch
      {...props}
      className="setting-switch"
      isSelected={optimistic ?? checked}
      isDisabled={disabled || optimistic !== null}
      onChange={(checked) => {
        setOptimistic(checked);
        Promise.resolve(onChange({ target: { checked } })).finally(() => setOptimistic(null));
      }}
    >
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Label>{label}</Label>
      </Switch.Content>
    </Switch>
  );
}
