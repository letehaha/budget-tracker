import { ref } from 'vue';

/**
 * How long a destructive background job (base-currency change, data restore) may
 * sit on one progress step before the UI adds a "still working" note. The backend
 * ticks progress once per table, so a single huge table legitimately holds one
 * step for minutes; past this window the note appears but the job keeps running
 * and blocking — it is never called failed. Shared by the blocking-job watchdog
 * and the restore dialog so the two thresholds can't drift.
 */
export const STALL_TAKING_LONG_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Tracks whether a job has stalled on one progress step. Feed it the current
 * progress signature via `track`; `isTakingLong` flips true once the signature
 * has held unchanged for `thresholdMs`, and resets whenever it changes. The
 * signature guard means per-poll object churn can't keep resetting the clock.
 */
export function useStallTimer({ thresholdMs = STALL_TAKING_LONG_THRESHOLD_MS }: { thresholdMs?: number } = {}) {
  const isTakingLong = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastSignature: string | null = null;

  const disarm = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  /** (Re)start the clock from now, clearing any pending "still working" note. */
  const arm = () => {
    disarm();
    isTakingLong.value = false;
    timer = setTimeout(() => {
      isTakingLong.value = true;
    }, thresholdMs);
  };

  /** Report the latest progress signature; re-arms only when it actually changed. */
  const track = ({ signature }: { signature: string }) => {
    if (signature === lastSignature) return;
    lastSignature = signature;
    arm();
  };

  /** Stop the clock and forget the last signature (job ended or dialog closed). */
  const reset = () => {
    disarm();
    lastSignature = null;
    isTakingLong.value = false;
  };

  return { isTakingLong, track, arm, reset };
}
