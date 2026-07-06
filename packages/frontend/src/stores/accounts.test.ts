import { type AccountWithRelinkStatus, type RecordId, type UserModel } from '@bt/shared/types';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { ACCOUNTS } from '@tests/mocks/accounts';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

import { useAccountsStore } from './accounts';
import { useUserStore } from './user';

// Mock the `@/api` barrel so the query resolves from a stub. `loadUserData` is
// included because the user store imports it from the same barrel.
vi.mock('@/api', () => ({
  loadAccounts: vi.fn(),
  loadUserData: vi.fn(),
  deleteAccount: vi.fn(),
  editAccount: vi.fn(),
  unlinkAccountFromBankConnection: vi.fn(),
}));

import { loadAccounts as apiLoadAccounts } from '@/api';

const mockLoadAccounts = vi.mocked(apiLoadAccounts);

/** An account carrying the given id, reusing a valid mock as the base shape. */
const withId = (id: string): AccountWithRelinkStatus => ({ ...ACCOUNTS[0]!, id: id as RecordId });

describe('useAccountsStore – accountsRecord mirrors the live accounts list', () => {
  let store: ReturnType<typeof useAccountsStore>;

  const mountStore = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const pinia = createPinia();
    setActivePinia(pinia);

    // The accounts query is gated on `isUserExists`; seed a signed-in user.
    useUserStore().user = {} as UserModel;

    const Wrapper = defineComponent({
      setup() {
        store = useAccountsStore();
        return () => null;
      },
    });
    mount(Wrapper, { global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] } });
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prunes an id that disappears from the accounts list while keeping survivors', async () => {
    const keep = withId('acc-keep');
    const drop = withId('acc-drop');

    mockLoadAccounts.mockResolvedValue([keep, drop]);
    mountStore();
    await flushPromises();

    expect(store.accountsRecord['acc-keep']).toBeDefined();
    expect(store.accountsRecord['acc-drop']).toBeDefined();

    // A later fetch no longer returns `acc-drop` (the account was deleted).
    mockLoadAccounts.mockResolvedValue([keep]);
    await store.refetchAccounts();
    await flushPromises();

    // The vanished id is pruned; survivors remain.
    expect(store.accountsRecord['acc-drop']).toBeUndefined();
    expect(store.accountsRecord['acc-keep']).toBeDefined();
    expect(Object.keys(store.accountsRecord)).toEqual(['acc-keep']);
  });
});
