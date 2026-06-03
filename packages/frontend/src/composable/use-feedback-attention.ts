import { trackAnalyticsEvent } from '@/lib/posthog';
import { differenceInDays } from 'date-fns';
import { onBeforeUnmount, onMounted, ref } from 'vue';

const PULSE_LS_KEY = 'feedback-pulse-last-interacted';
const PULSE_INTERVAL_DAYS = 14;
const PULSE_CYCLES = 3;
const PULSE_CYCLE_MS = 1500;
const PULSE_START_DELAY_MS = 800;

/**
 * Drives the periodic "have feedback?" attention pulse on the feedback button.
 * Pulses once on mount (after a short delay), then once every 14 days. Any
 * hover or click dismisses the pulse and resets the cooldown — the goal is to
 * be noticeable on first paint, then get out of the way.
 */
export function useFeedbackAttention() {
  const isPulsing = ref(false);
  const interactionTracked = ref(false);
  let pulseStartTimer: ReturnType<typeof setTimeout> | null = null;
  let pulseEndTimer: ReturnType<typeof setTimeout> | null = null;

  const markInteracted = () => {
    localStorage.setItem(PULSE_LS_KEY, new Date().toISOString());
  };

  const stopPulse = () => {
    isPulsing.value = false;
    if (pulseEndTimer) {
      clearTimeout(pulseEndTimer);
      pulseEndTimer = null;
    }
  };

  const shouldStartPulse = (): boolean => {
    const last = localStorage.getItem(PULSE_LS_KEY);
    if (!last) return true;
    const parsed = new Date(last);
    if (Number.isNaN(parsed.getTime())) return true;
    return differenceInDays(new Date(), parsed) >= PULSE_INTERVAL_DAYS;
  };

  const startPulse = () => {
    isPulsing.value = true;
    pulseEndTimer = setTimeout(() => {
      isPulsing.value = false;
      pulseEndTimer = null;
    }, PULSE_CYCLE_MS * PULSE_CYCLES);
  };

  const onEnter = () => {
    if (isPulsing.value) stopPulse();
    if (interactionTracked.value) return;
    interactionTracked.value = true;
    trackAnalyticsEvent({ event: 'feedback_button_hovered' });
    markInteracted();
  };

  const onClick = () => {
    if (isPulsing.value) stopPulse();
    trackAnalyticsEvent({ event: 'feedback_button_clicked' });
    // Mark on every click — cheap, and ensures keyboard activation also dismisses the nudge.
    interactionTracked.value = true;
    markInteracted();
  };

  onMounted(() => {
    if (!shouldStartPulse()) return;
    pulseStartTimer = setTimeout(() => {
      startPulse();
      pulseStartTimer = null;
    }, PULSE_START_DELAY_MS);
  });

  onBeforeUnmount(() => {
    if (pulseStartTimer) clearTimeout(pulseStartTimer);
    if (pulseEndTimer) clearTimeout(pulseEndTimer);
  });

  return { isPulsing, onEnter, onClick };
}
