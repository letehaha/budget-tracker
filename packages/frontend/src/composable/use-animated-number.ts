import { type Ref, onUnmounted, ref, watch } from 'vue';

/**
 * Animates a numeric value from its previous to its current state using
 * requestAnimationFrame with an ease-out cubic curve.
 *
 * The first value is applied immediately (no animation on mount).
 */
export function useAnimatedNumber({ value, duration = 300 }: { value: Ref<number>; duration?: number }) {
  const displayValue = ref(value.value);
  let animationFrame: number | null = null;
  let isFirstValue = true;

  watch(value, (newVal, oldVal) => {
    // Skip animation for the very first value (initial load)
    if (isFirstValue) {
      isFirstValue = false;
      displayValue.value = newVal;
      return;
    }

    if (animationFrame) cancelAnimationFrame(animationFrame);

    const startVal = oldVal ?? 0;
    const diff = newVal - startVal;

    // No animation needed if value didn't change
    if (diff === 0) return;

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic: fast start, gentle deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      displayValue.value = startVal + diff * eased;

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        displayValue.value = newVal;
        animationFrame = null;
      }
    };

    animationFrame = requestAnimationFrame(animate);
  });

  onUnmounted(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
  });

  return { displayValue };
}
