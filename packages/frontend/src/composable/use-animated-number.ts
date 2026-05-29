import { TransitionPresets, useTransition } from '@vueuse/core';
import { type Ref } from 'vue';

/**
 * Animates a numeric value from its previous to its current state with an
 * ease-out cubic curve. The initial value is applied immediately (no animation on mount).
 */
export function useAnimatedNumber({ value, duration = 300 }: { value: Ref<number>; duration?: number }) {
  const displayValue = useTransition(value, {
    duration,
    transition: TransitionPresets.easeOutCubic,
  });

  return { displayValue };
}
