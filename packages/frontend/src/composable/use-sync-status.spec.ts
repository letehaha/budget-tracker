import { FEATURES } from '@bt/shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, toValue } from 'vue';

const getSyncStatus = vi.fn();
const checkSync = vi.fn();
const triggerSyncRequest = vi.fn();

const auth = vi.hoisted(() => ({ isLoggedIn: { value: true } }));
const user = vi.hoisted(() => ({ isDemo: { value: false }, hasFeature: vi.fn(() => true) }));
// Holds the options `useQuery` was called with so a test can read back `enabled`.
const query = vi.hoisted(() => ({ options: null as { enabled?: unknown } | null, data: { value: null as unknown } }));

vi.mock('@/api/bank-data-providers', () => ({
  getSyncStatus: (...args: unknown[]) => getSyncStatus(...args),
  checkSync: (...args: unknown[]) => checkSync(...args),
  triggerSync: (...args: unknown[]) => triggerSyncRequest(...args),
  SyncStatus: { IDLE: 'idle', QUEUED: 'queued', SYNCING: 'syncing', COMPLETED: 'completed', FAILED: 'failed' },
}));

// Captures the SSE handler the composable registers, so a test can push a status
// snapshot through it without a real connection.
const sse = vi.hoisted(() => ({ handler: null as ((data: unknown) => void) | null, disconnect: vi.fn() }));

vi.mock('./use-sse', () => ({
  SSE_EVENT_TYPES: { SYNC_STATUS_CHANGED: 'sync_status_changed' },
  useSSE: () => ({
    connect: vi.fn(),
    disconnect: sse.disconnect,
    on: vi.fn((_event: string, handler: (data: unknown) => void) => {
      sse.handler = handler;
      return () => {};
    }),
    isConnected: { value: false },
  }),
}));

vi.mock('@/common/const', () => ({
  VUE_QUERY_CACHE_KEYS: {
    bankSyncStatus: ['bankSyncStatus'],
    payeesList: ['payeesList'],
    payeesLookup: ['payeesLookup'],
    allAccounts: ['allAccounts'],
  },
  VUE_QUERY_GLOBAL_PREFIXES: { transactionChange: 'transactionChange', bankConnectionChange: 'bankConnectionChange' },
}));

const invalidatePersistedQuery = vi.fn();
vi.mock('@/lib/query-client', () => ({
  invalidatePersistedQuery: (...args: unknown[]) => {
    invalidatePersistedQuery(...args);
    return Promise.resolve();
  },
}));

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

vi.mock('@/i18n', () => ({ ensureChunkLoaded: vi.fn() }));

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }));
vi.mock('@/stores/user', () => ({ useUserStore: () => user }));
vi.mock('pinia', () => ({ storeToRefs: (store: unknown) => store }));

const queryClient = vi.hoisted(() => ({
  getQueryData: vi.fn(),
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/vue-query', () => ({
  useQueryClient: () => queryClient,
  useQuery: (options: { enabled?: unknown }) => {
    query.options = options;
    return { data: query.data, isFetching: ref(false), refetch: vi.fn() };
  },
  useMutation: ({ mutationFn }: { mutationFn: () => Promise<unknown> }) => ({
    isPending: ref(false),
    mutateAsync: mutationFn,
  }),
}));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import { useSyncStatus } from './use-sync-status';

describe('useSyncStatus demo gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isLoggedIn.value = true;
    user.isDemo.value = false;
    user.hasFeature.mockReturnValue(true);
    query.options = null;
  });

  it('keeps the status query disabled for a demo user', () => {
    user.isDemo.value = true;

    useSyncStatus();

    expect(toValue(query.options?.enabled)).toBe(false);
    expect(getSyncStatus).not.toHaveBeenCalled();
  });

  it('enables the status query for a regular signed-in user', () => {
    useSyncStatus();

    expect(toValue(query.options?.enabled)).toBe(true);
  });

  it('keeps the status query disabled when the plan lacks bank providers', () => {
    user.hasFeature.mockReturnValue(false);

    useSyncStatus();

    expect(toValue(query.options?.enabled)).toBe(false);
    expect(user.hasFeature).toHaveBeenCalledWith(FEATURES.bank_providers);
    expect(getSyncStatus).not.toHaveBeenCalled();
  });

  it('does not call the check endpoint for a demo user', async () => {
    user.isDemo.value = true;

    const result = await useSyncStatus().checkAndAutoSync();

    expect(result).toBeNull();
    expect(checkSync).not.toHaveBeenCalled();
  });

  it('does not call the check endpoint when the plan lacks bank providers', async () => {
    user.hasFeature.mockReturnValue(false);

    const result = await useSyncStatus().checkAndAutoSync();

    expect(result).toBeNull();
    expect(checkSync).not.toHaveBeenCalled();
  });

  it('calls the check endpoint for a regular signed-in user', async () => {
    checkSync.mockResolvedValueOnce({ syncTriggered: false });

    await useSyncStatus().checkAndAutoSync();

    expect(checkSync).toHaveBeenCalled();
  });

  it('does not trigger a sync for a demo user', async () => {
    user.isDemo.value = true;

    const started = await useSyncStatus().triggerSync(true);

    expect(started).toBe(false);
    expect(triggerSyncRequest).not.toHaveBeenCalled();
  });

  it('does not watch a sync for a demo user', async () => {
    user.isDemo.value = true;

    await useSyncStatus().watchSync();

    expect(getSyncStatus).not.toHaveBeenCalled();
  });
});

const buildStatus = ({ syncing }: { syncing: number }) => ({
  summary: { syncing, queued: 0, completed: 0, failed: 0, total: 1 },
  accounts: [],
  connectionsNeedingReauth: [],
});

describe('useSyncStatus hasSyncIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isLoggedIn.value = true;
    user.isDemo.value = false;
    user.hasFeature.mockReturnValue(true);
    query.data.value = null;
  });

  const statusWith = ({
    accounts = [],
    connectionsNeedingReauth = [],
  }: {
    accounts?: { status: string }[];
    connectionsNeedingReauth?: { connectionId: string }[];
  }) => ({
    summary: { syncing: 0, queued: 0, completed: 1, failed: 0, total: 1 },
    accounts,
    connectionsNeedingReauth,
  });

  it('is false for a healthy status payload', () => {
    query.data.value = statusWith({ accounts: [{ status: 'completed' }] });

    expect(useSyncStatus().hasSyncIssue.value).toBe(false);
  });

  it('is true when an account failed to sync', () => {
    query.data.value = statusWith({ accounts: [{ status: 'completed' }, { status: 'failed' }] });

    expect(useSyncStatus().hasSyncIssue.value).toBe(true);
  });

  it('is true when a connection needs reauth even though no account row failed', () => {
    query.data.value = statusWith({
      accounts: [{ status: 'completed' }],
      connectionsNeedingReauth: [{ connectionId: 'conn-1' }],
    });

    expect(useSyncStatus().hasSyncIssue.value).toBe(true);
  });
});

describe('useSyncStatus cache invalidation on sync completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isLoggedIn.value = true;
    user.isDemo.value = false;
    useSyncStatus().subscribeToSSE();
  });

  const completeSync = () => {
    queryClient.getQueryData.mockReturnValueOnce(buildStatus({ syncing: 1 }));
    sse.handler?.(buildStatus({ syncing: 0 }));
  };

  it('drops the persisted accounts snapshot so balances match the refreshed planned deltas', () => {
    completeSync();

    expect(invalidatePersistedQuery).toHaveBeenCalledWith({ queryKey: ['allAccounts'] });
  });

  it('leaves the persisted accounts snapshot alone while a sync is still running', () => {
    queryClient.getQueryData.mockReturnValueOnce(buildStatus({ syncing: 1 }));
    sse.handler?.(buildStatus({ syncing: 1 }));

    expect(invalidatePersistedQuery).not.toHaveBeenCalled();
  });

  it('still invalidates the transaction-change prefix the planned summary lives under', () => {
    completeSync();

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['transactionChange'] });
  });

  it('leaves the app-wide SSE stream open so other features keep receiving events', () => {
    completeSync();

    expect(sse.disconnect).not.toHaveBeenCalled();
  });
});
