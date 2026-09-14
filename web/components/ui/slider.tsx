'use client';
import { Slider as HeroSlider } from '@heroui/react';
export function Slider({
  min = 0,
  max = 100,
  value,
  defaultValue,
  onValueChange,
  disabled,
  ...props
}: {
  min?: number;
  max?: number;
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (values: number[]) => void;
  disabled?: boolean;
  [key: string]: any;
}) {
  return (
    <HeroSlider
      {...props}
      minValue={min}
      maxValue={max}
      value={value?.[0]}
      defaultValue={defaultValue?.[0]}
      isDisabled={disabled}
      onChange={(v) => onValueChange?.(Array.isArray(v) ? v : [v])}
    >
      <HeroSlider.Track>
        <HeroSlider.Fill />
        <HeroSlider.Thumb />
      </HeroSlider.Track>
    </HeroSlider>
  );
}
