import { type ResourceLeaseState, useResourceLease } from '@/composable/use-resource-lease';
import { ApiErrorResponseError } from '@/js/errors';
import { API_ERROR_CODES, RESOURCE_LEASE_IDLE_AFTER_MS, type ResourceLease } from '@bt/shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EffectScope, type Ref, effectScope, ref } from 'vue';

const REFRESH_INTERVAL_MS = 30 * 1000;
const IDLE_TTL_MS = 15 * 60 * 1000;
const MAX_LIFETIME_MS = 4 * 60 * 60 * 1000;

let scope: EffectScope;

const makeLease = ({
  ttlMs = IDLE_TTL_MS,
  capMs = MAX_LIFETIME_MS,
}: { ttlMs?: number; capMs?: number } = {}): ResourceLease => ({
  expiresAt: new Date(Date.now() + ttlMs).toISOString(),
  maxExpiresAt: new Date(Date.now() + capMs).toISOString(),
  expiresInMs: ttlMs,
  maxExpiresInMs: capMs,
});

const setup = ({
  lease,
  refresh,
  enabled = ref(true),
}: {
  lease: Ref<ResourceLease | null>;
  refresh: () => Promise<ResourceLease | null>;
  enabled?: Ref<boolean>;
}) => {
  scope = effectScope();
  return scope.run(() => useResourceLease({ lease, refresh, enabled }))!;
};

const interact = () => {
  document.dispatchEvent(new Event('pointerdown'));
};

const notFoundError = () =>
  new ApiErrorResponseError('Upload is no longer available', { code: API_ERROR_CODES.notFound });

/** Instants an hour behind the client's clock, with correct relative durations. */
const makeSkewedLease = ({ ttlMs }: { ttlMs: number }): ResourceLease => ({
  expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  maxExpiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  expiresInMs: ttlMs,
  maxExpiresInMs: ttlMs,
});

describe('useResourceLease', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T10:00:00.000Z'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  afterEach(() => {
    scope?.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reports inactive while no lease is held', () => {
    const refresh = vi.fn(async () => makeLease());
    const machine = setup({ lease: ref<ResourceLease | null>(null), refresh });

    expect(machine.state.value).toBe<ResourceLeaseState>('inactive');
    expect(machine.isExpired.value).toBe(false);
  });

  it('counts down from when the lease arrived, ignoring a skewed client clock', async () => {
    const ttlMs = 60_000;
    const refresh = vi.fn(async () => makeSkewedLease({ ttlMs }));
    const lease = ref<ResourceLease | null>(makeSkewedLease({ ttlMs }));
    const machine = setup({ lease, refresh });

    expect(machine.state.value).toBe<ResourceLeaseState>('counting-down');
    expect(machine.msRemaining.value).toBe(ttlMs);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(machine.msRemaining.value).toBe(ttlMs - 10_000);
  });

  it('refreshes at most once per interval however much the user interacts', async () => {
    const refresh = vi.fn(async () => makeLease());
    const lease = ref<ResourceLease | null>(makeLease());
    const machine = setup({ lease, refresh });

    expect(machine.state.value).toBe<ResourceLeaseState>('active');

    await vi.advanceTimersByTimeAsync(10_000);
    for (let i = 0; i < 20; i += 1) interact();

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS - 10_000 - 1);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 20; i += 1) interact();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('never runs two refreshes at once', async () => {
    const refresh = vi.fn(() => new Promise<ResourceLease | null>(() => {}));
    const lease = ref<ResourceLease | null>(makeLease());
    setup({ lease, refresh });

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 6);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not tick while the user is active', async () => {
    const refresh = vi.fn(async () => makeLease());
    const lease = ref<ResourceLease | null>(makeLease());
    const machine = setup({ lease, refresh });

    const remainingAtStart = machine.msRemaining.value;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(machine.state.value).toBe<ResourceLeaseState>('active');
    expect(machine.msRemaining.value).toBe(remainingAtStart);
  });

  it('counts down once the user goes idle', async () => {
    const refresh = vi.fn(async () => makeLease());
    const lease = ref<ResourceLease | null>(makeLease());
    const machine = setup({ lease, refresh });

    await vi.advanceTimersByTimeAsync(RESOURCE_LEASE_IDLE_AFTER_MS + 1_000);
    expect(machine.state.value).toBe<ResourceLeaseState>('counting-down');

    const remaining = machine.msRemaining.value;
    const callsWhenIdle = refresh.mock.calls.length;

    await vi.advanceTimersByTimeAsync(3_000);
    expect(machine.msRemaining.value).toBe(remaining - 3_000);
    expect(refresh).toHaveBeenCalledTimes(callsWhenIdle);
  });

  it('counts down even while the user is active once the lease is capped', async () => {
    const refresh = vi.fn(async () => makeLease());
    const cappedTtlMs = 5 * 60 * 1000;
    const lease = ref<ResourceLease | null>(makeLease({ ttlMs: cappedTtlMs, capMs: cappedTtlMs }));
    const machine = setup({ lease, refresh });

    expect(machine.isCapped.value).toBe(true);
    expect(machine.state.value).toBe<ResourceLeaseState>('counting-down');

    await vi.advanceTimersByTimeAsync(60_000);
    interact();

    expect(refresh).not.toHaveBeenCalled();
    expect(machine.state.value).toBe<ResourceLeaseState>('counting-down');
    expect(machine.msRemaining.value).toBe(cappedTtlMs - 60_000);
  });

  it('expires when the lease runs out while counting down', async () => {
    const refresh = vi.fn(async () => makeLease());
    const ttlMs = 60_000;
    const lease = ref<ResourceLease | null>(makeLease({ ttlMs, capMs: ttlMs }));
    const machine = setup({ lease, refresh });

    await vi.advanceTimersByTimeAsync(ttlMs);

    expect(machine.state.value).toBe<ResourceLeaseState>('expired');
    expect(machine.isExpired.value).toBe(true);
    expect(machine.msRemaining.value).toBe(0);
  });

  it('expires and stops refreshing when the resource is gone', async () => {
    const refresh = vi.fn(async () => {
      throw notFoundError();
    });
    const lease = ref<ResourceLease | null>(makeLease());
    const machine = setup({ lease, refresh });

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(machine.state.value).toBe<ResourceLeaseState>('expired');
    expect(machine.isExpired.value).toBe(true);

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 10);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('expires when refresh resolves without a lease', async () => {
    const refresh = vi.fn(async () => null);
    const lease = ref<ResourceLease | null>(makeLease());
    const machine = setup({ lease, refresh });

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(machine.state.value).toBe<ResourceLeaseState>('expired');
  });

  it('keeps beating after a transient failure', async () => {
    const refresh = vi.fn(async () => {
      throw new Error('Network request failed');
    });
    const lease = ref<ResourceLease | null>(makeLease());
    const machine = setup({ lease, refresh });

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(machine.state.value).toBe<ResourceLeaseState>('active');

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('writes the refreshed lease back and clears a stale expiry', async () => {
    const refresh = vi.fn(async () => makeLease());
    const lease = ref<ResourceLease | null>(makeLease());
    const machine = setup({ lease, refresh });

    const originalExpiresAt = lease.value!.expiresAt;
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);

    expect(lease.value!.expiresAt).not.toBe(originalExpiresAt);
    expect(machine.msRemaining.value).toBe(IDLE_TTL_MS);
  });

  it('stays dormant while disabled', async () => {
    const refresh = vi.fn(async () => makeLease());
    const lease = ref<ResourceLease | null>(makeLease());
    const machine = setup({ lease, refresh, enabled: ref(false) });

    const remainingAtStart = machine.msRemaining.value;
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 4);

    expect(refresh).not.toHaveBeenCalled();
    expect(machine.msRemaining.value).toBe(remainingAtStart);
  });

  it('formats the remaining time as a clock', () => {
    const refresh = vi.fn(async () => makeLease());
    const lease = ref<ResourceLease | null>(makeLease({ ttlMs: 5 * 60 * 1000 + 7_000, capMs: 5 * 60 * 1000 + 7_000 }));
    const machine = setup({ lease, refresh });

    expect(machine.formattedRemaining.value).toBe('5:07');
  });

  it('stops every timer once the scope is disposed', async () => {
    const refresh = vi.fn(async () => makeLease());
    const lease = ref<ResourceLease | null>(makeLease({ ttlMs: 60_000, capMs: 60_000 }));
    const machine = setup({ lease, refresh });

    const remainingAtStart = machine.msRemaining.value;
    scope.stop();

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 10);
    expect(refresh).not.toHaveBeenCalled();
    expect(machine.msRemaining.value).toBe(remainingAtStart);
  });

  it('does not re-arm the heartbeat when the scope is disposed mid-refresh', async () => {
    let settleRefresh: (lease: ResourceLease) => void = () => {};
    const refresh = vi.fn(
      () =>
        new Promise<ResourceLease | null>((resolve) => {
          settleRefresh = resolve;
        }),
    );
    const lease = ref<ResourceLease | null>(makeLease());
    setup({ lease, refresh });

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(refresh).toHaveBeenCalledTimes(1);

    scope.stop();
    settleRefresh(makeLease());
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 10);

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
