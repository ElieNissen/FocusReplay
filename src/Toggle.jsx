import React, { useState } from 'react';
export function Toggle({ checked, onChange, disabled, ...props }) {
  const [optimistic, setOptimistic] = useState(null);
  return (
    <input
      {...props}
      type="checkbox"
      checked={optimistic ?? checked}
      disabled={disabled || optimistic !== null}
      onChange={(e) => {
        setOptimistic(e.target.checked);
        Promise.resolve(onChange(e)).finally(() => setOptimistic(null));
      }}
    />
  );
}
