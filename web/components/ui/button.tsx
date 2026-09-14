'use client';
import type { ComponentProps } from 'react';
import { Button as HeroButton } from '@heroui/react';
type Props = ComponentProps<'button'> & {
  variant?: string;
  size?: 'default' | 'sm' | 'lg' | 'xs' | 'icon' | 'icon-sm' | 'icon-lg' | 'icon-xs';
  asChild?: boolean;
};
export function Button({
  disabled,
  onClick,
  variant = 'default',
  size = 'default',
  type = 'submit',
  asChild,
  ...props
}: Props) {
  return (
    <HeroButton
      {...(props as ComponentProps<typeof HeroButton>)}
      type={type}
      onClick={onClick as ComponentProps<typeof HeroButton>['onClick']}
      isDisabled={disabled}
      variant={
        (
          {
            default: 'primary',
            outline: 'secondary',
            ghost: 'tertiary',
            destructive: 'danger',
            secondary: 'secondary',
          } as any
        )[variant] || variant
      }
      size={(size === 'default' ? 'md' : size.startsWith('icon') ? 'sm' : size) as any}
      isIconOnly={size.startsWith('icon')}
    />
  );
}
export const buttonVariants = (_options?: any) => 'button';
