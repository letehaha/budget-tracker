import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, toValue } from 'vue';

const getSyncStatus = vi.fn();
const checkSync = vi.fn();
const triggerSyncRequest = vi.fn();

const auth = vi.hoisted(() => ({ isLoggedIn: { value: true } }));
const user = vi.hoisted(() => ({ isDemo: { value: false } }));
// Holds the options `useQuery` was called with so a test can read back `enabled`.
const query = vi.hoisted(() => ({ options: null as { enabled?: unknown } | null }));

vi.mock('@/api/bank-data-providers', () => ({
  getSyncStatus: (...args: unknown[]) => getSyncStatus(...args),
  checkSync: (...args: unknown[]) => checkSync(...args),
  triggerSync: (...args: unknown[]) => triggerSyncRequest(...args),
}));

vi.mock('./use-sse', () => ({
  SSE_EVENT_TYPES: { SYNC_STATUS_CHANGED: 'sync_status_changed' },
  useSSE: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(() => () => {}),
    isConnected: { value: false },
  }),
}));

vi.mock('@/common/const', () => ({
  VUE_QUERY_CACHE_KEYS: {
    bankSyncStatus: ['bankSyncStatus'],
    payeesList: ['payeesList'],
    payeesLookup: ['payeesLookup'],
  },
  VUE_QUERY_GLOBAL_PREFIXES: { transactionChange: 'transactionChange', bankConnectionChange: 'bankConnectionChange' },
}));

vi.mock('@/i18n', () => ({ ensureChunkLoaded: vi.fn() }));

vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }));
vi.mock('@/stores/user', () => ({ useUserStore: () => user }));
vi.mock('pinia', () => ({ storeToRefs: (store: unknown) => store }));

vi.mock('@tanstack/vue-query', () => ({
  useQueryClient: () => ({ getQueryData: vi.fn(), setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useQuery: (options: { enabled?: unknown }) => {
    query.options = options;
    return { data: ref(null), isFetching: ref(false), refetch: vi.fn() };
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

  it('does not call the check endpoint for a demo user', async () => {
    user.isDemo.value = true;

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
