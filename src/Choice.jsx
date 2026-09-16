import React from 'react';
import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
export default function Choice({ label, value, options, onChange }) {
  return (
    <ToggleButtonGroup
      className="choice-buttons"
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={new Set([value])}
      onSelectionChange={(keys) => onChange([...keys][0])}
    >
      {options.map(([id, label]) => (
        <ToggleButton id={id} key={id}>
          {label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
