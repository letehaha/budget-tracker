import { formatCountdown } from '@/common/utils/duration';
import { isResourceMissingError } from '@/js/errors';
import { RESOURCE_LEASE_IDLE_AFTER_MS, RESOURCE_LEASE_REFRESH_INTERVAL_MS, type ResourceLease } from '@bt/shared/types';
import { type ComputedRef, type MaybeRefOrGetter, type Ref, computed, onScopeDispose, ref, toValue, watch } from 'vue';

import { useUserActivity } from './use-user-activity';

const TICK_INTERVAL_MS = 1000;

export type ResourceLeaseState = 'inactive' | 'active' | 'counting-down' | 'expired';

interface UseResourceLeaseReturn {
  /** `inactive` while no lease is held, so a consumer can render on the state alone. */
  state: ComputedRef<ResourceLeaseState>;
  /** Milliseconds left on the lease. Only moves while `state` is `counting-down`. */
  msRemaining: ComputedRef<number>;
  /** `msRemaining` as a `m:ss` / `h:mm:ss` clock. */
  formattedRemaining: ComputedRef<string>;
  isExpired: ComputedRef<boolean>;
  /** True once refreshing can no longer buy time, i.e. the absolute cap is reached. */
  isCapped: ComputedRef<boolean>;
}

/**
 * Keeps a server-side lease alive while the user works, and counts it down once
 * they stop. The two are mutually exclusive by design: the 1s ticker runs only
 * in `counting-down`, so a refresh can never visibly rewind a displayed number.
 *
 * Refresh results are written back into `lease`, so a caller can hand over its
 * store ref and keep one source of truth.
 */
export function useResourceLease({
  lease,
  refresh,
  enabled,
  idleAfterMs = RESOURCE_LEASE_IDLE_AFTER_MS,
  refreshIntervalMs = RESOURCE_LEASE_REFRESH_INTERVAL_MS,
}: {
  lease: Ref<ResourceLease | null>;
  refresh: () => Promise<ResourceLease | null>;
  enabled: Ref<boolean>;
  idleAfterMs?: MaybeRefOrGetter<number>;
  refreshIntervalMs?: MaybeRefOrGetter<number>;
}): UseResourceLeaseReturn {
  const { isActive } = useUserActivity({ idleAfterMs });

  const now = ref(Date.now());
  const hasExpired = ref(false);
  /** Client-clock instant the current lease arrived; every countdown is measured from here. */
  const receivedAt = ref(Date.now());

  const msRemaining = computed(() => {
    const current = lease.value;
    if (!current) return 0;
    return Math.max(0, receivedAt.value + current.expiresInMs - now.value);
  });

  const isCapped = computed(() => {
    const current = lease.value;
    if (!current) return false;
    return current.expiresInMs >= current.maxExpiresInMs;
  });

  const state = computed<ResourceLeaseState>(() => {
    if (!lease.value) return 'inactive';
    if (hasExpired.value) return 'expired';
    if (msRemaining.value <= 0) return 'expired';
    if (isCapped.value) return 'counting-down';
    return enabled.value && isActive.value ? 'active' : 'counting-down';
  });

  const isExpired = computed(() => state.value === 'expired');
  const formattedRemaining = computed(() => formatCountdown({ ms: msRemaining.value }));

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let isRefreshing = false;
  let lastRefreshAt = Date.now();
  let isDisposed = false;

  const stopHeartbeat = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };

  const stopTicker = () => {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };

  const shouldHeartbeat = computed(() => state.value === 'active');
  const shouldTick = computed(() => enabled.value && state.value === 'counting-down');

  const runRefresh = async () => {
    if (isRefreshing) return;
    isRefreshing = true;
    lastRefreshAt = Date.now();

    try {
      const next = await refresh();
      if (next) {
        lease.value = next;
      } else {
        hasExpired.value = true;
      }
    } catch (error) {
      // Anything else (offline, 5xx) is transient — the next beat retries.
      if (isResourceMissingError(error)) hasExpired.value = true;
    } finally {
      isRefreshing = false;
      now.value = Date.now();
    }
  };

  const scheduleNextRefresh = () => {
    stopHeartbeat();
    if (isDisposed) return;

    const dueInMs = Math.max(0, lastRefreshAt + toValue(refreshIntervalMs) - Date.now());

    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void runRefresh().then(() => {
        // A request in flight when the scope goes away owns no timer to cancel, so
        // its continuation is the one thing that can restart an unowned heartbeat.
        if (!isDisposed && shouldHeartbeat.value) scheduleNextRefresh();
      });
    }, dueInMs);
  };

  watch(
    shouldHeartbeat,
    (active) => {
      if (active) scheduleNextRefresh();
      else stopHeartbeat();
    },
    { immediate: true },
  );

  watch(
    shouldTick,
    (ticking) => {
      stopTicker();
      if (!ticking) return;
      now.value = Date.now();
      tickTimer = setInterval(() => {
        now.value = Date.now();
      }, TICK_INTERVAL_MS);
    },
    { immediate: true },
  );

  // Sync flush: `msRemaining` mixes the incoming duration with this anchor, so a
  // deferred update would briefly measure a fresh lease from the old anchor.
  watch(
    lease,
    (current) => {
      receivedAt.value = Date.now();
      now.value = receivedAt.value;
      if (current && current.expiresInMs > 0) hasExpired.value = false;
    },
    { flush: 'sync' },
  );

  onScopeDispose(() => {
    isDisposed = true;
    stopHeartbeat();
    stopTicker();
  });

  return { state, msRemaining, formattedRemaining, isExpired, isCapped };
}
