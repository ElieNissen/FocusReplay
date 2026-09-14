import React from 'react';
import { Button as HeroButton, Input as HeroInput } from '@heroui/react';
export function Button({ disabled, onClick, className = '', type = 'submit', variant, ...props }) {
  return (
    <HeroButton
      {...props}
      type={type}
      className={className}
      isDisabled={disabled}
      onPress={onClick}
      variant={
        variant ||
        (/primary|start-button|play-button/.test(className)
          ? 'primary'
          : className.includes('danger')
            ? 'danger'
            : /icon-button|text-button|session-row|day-button/.test(className)
              ? 'tertiary'
              : 'secondary')
      }
    />
  );
}
export const Input = HeroInput;
