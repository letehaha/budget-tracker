import * as api from '@/api';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import * as Select from '@/components/lib/ui/select';
import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import { createTestingPinia } from '@pinia/testing';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import * as dataMocks from '@tests/mocks';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';

import CreateAccountForm from './create-account-form.vue';

vi.mock('@/api', async (importOriginal) => {
  const original = await importOriginal<typeof api>();
  return {
    ...original,
    createAccount: vi.fn().mockResolvedValue({}),
  };
});

vi.mock('@/lib/posthog', () => ({
  trackAnalyticsEvent: vi.fn(),
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: {} },
});

const createTestRouter = ({ query = {} }: { query?: Record<string, string> } = {}) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div />' } },
      { path: '/accounts/create', name: 'accounts-create', component: { template: '<div />' } },
    ],
  });
  router.push({ path: '/accounts/create', query });
  return router;
};

const mountComponent = async ({ routeQuery = {} }: { routeQuery?: Record<string, string> } = {}) => {
  const router = createTestRouter({ query: routeQuery });
  await router.isReady();

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const wrapper = mount(CreateAccountForm, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            user: { user: dataMocks.USER },
            currencies: {
              currencies: dataMocks.USER_CURRENCIES,
              systemCurrencies: dataMocks.SYSTEM_CURRENCIES,
              baseCurrency: dataMocks.USER_BASE_CURRENCY,
            },
          },
        }),
        [VueQueryPlugin, { queryClient }],
        router,
        i18n,
      ],
    },
  });

  return { wrapper, queryClient };
};

// Helper to simulate typing in a number input by dispatching a raw input event,
// matching the pattern from input-field.test.ts
const simulateNumberInput = async ({
  wrapper,
  input,
  value,
}: {
  wrapper: Awaited<ReturnType<typeof mountComponent>>['wrapper'];
  input: ReturnType<ReturnType<typeof mount>['find']>;
  value: string;
}) => {
  const inputEl = input.element as HTMLInputElement;
  inputEl.value = value;
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  await wrapper.vm.$nextTick();
};

const submitForm = async ({ wrapper }: { wrapper: Awaited<ReturnType<typeof mountComponent>>['wrapper'] }) => {
  await wrapper.find('form').trigger('submit');
  await wrapper.vm.$nextTick();
  // Let the microtask queue flush (stubbed action resolves immediately)
  await vi.waitFor(() => {
    const submitBtn = wrapper.find('button[type="submit"]');
    expect(submitBtn.attributes('disabled')).toBeUndefined();
  });
};

const createAccountMock = vi.mocked(api.createAccount);

describe('CreateAccountForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAccountMock.mockResolvedValue({} as Awaited<ReturnType<typeof api.createAccount>>);
  });

  describe('1. User enters data — API is called with expected payload', () => {
    it('sends initialBalance and creditLimit as numbers in the payload', async () => {
      const { wrapper } = await mountComponent();

      // Fill name
      const nameInput = wrapper.find<HTMLInputElement>('input:not([type="number"])');
      await nameInput.setValue('My Savings');

      // Fill initialBalance (first number input)
      const numberInputs = wrapper.findAll<HTMLInputElement>('input[type="number"]');
      await simulateNumberInput({ wrapper, input: numberInputs[0]!, value: '250.50' });

      // Fill creditLimit (second number input)
      await simulateNumberInput({ wrapper, input: numberInputs[1]!, value: '1000' });

      await submitForm({ wrapper });

      expect(createAccountMock).toHaveBeenCalledTimes(1);
      const payload = createAccountMock.mock.calls[0]![0];

      expect(payload).toEqual(
        expect.objectContaining({
          name: 'My Savings',
          initialBalance: 250.5,
          creditLimit: 1000,
          accountCategory: ACCOUNT_CATEGORIES.general,
          currencyCode: expect.any(String),
        }),
      );
      expect(typeof payload.initialBalance).toBe('number');
      expect(typeof payload.creditLimit).toBe('number');
    });

    it('sends default 0 values when number fields are untouched', async () => {
      const { wrapper } = await mountComponent();

      const nameInput = wrapper.find<HTMLInputElement>('input:not([type="number"])');
      await nameInput.setValue('Default Account');

      await submitForm({ wrapper });

      expect(createAccountMock).toHaveBeenCalledTimes(1);
      const payload = createAccountMock.mock.calls[0]![0];

      expect(payload.initialBalance).toBe(0);
      expect(typeof payload.initialBalance).toBe('number');
      expect(payload.creditLimit).toBe(0);
      expect(typeof payload.creditLimit).toBe('number');
    });
  });

  describe('2. User enters edge-case data — API is still called as-is', () => {
    it('sends negative initialBalance without blocking', async () => {
      const { wrapper } = await mountComponent();

      const nameInput = wrapper.find<HTMLInputElement>('input:not([type="number"])');
      await nameInput.setValue('Test Account');

      const numberInputs = wrapper.findAll<HTMLInputElement>('input[type="number"]');
      await simulateNumberInput({ wrapper, input: numberInputs[0]!, value: '-500' });

      await submitForm({ wrapper });

      expect(createAccountMock).toHaveBeenCalledTimes(1);
      const payload = createAccountMock.mock.calls[0]![0];
      expect(payload.initialBalance).toBe(-500);
    });

    it('sends very large numbers without blocking', async () => {
      const { wrapper } = await mountComponent();

      const nameInput = wrapper.find<HTMLInputElement>('input:not([type="number"])');
      await nameInput.setValue('Big Balance');

      const numberInputs = wrapper.findAll<HTMLInputElement>('input[type="number"]');
      await simulateNumberInput({ wrapper, input: numberInputs[0]!, value: '99999999.99' });

      await submitForm({ wrapper });

      expect(createAccountMock).toHaveBeenCalledTimes(1);
      const payload = createAccountMock.mock.calls[0]![0];
      expect(payload.initialBalance).toBe(99999999.99);
      expect(typeof payload.initialBalance).toBe('number');
    });

    it('sends empty name (no frontend validation blocks it)', async () => {
      const { wrapper } = await mountComponent();

      await submitForm({ wrapper });

      expect(createAccountMock).toHaveBeenCalledTimes(1);
      const payload = createAccountMock.mock.calls[0]![0];
      expect(payload.name).toBe('');
    });
  });

  describe('3. Route query "category" prefills the account category', () => {
    it('defaults to "general" when no query param is set', async () => {
      const { wrapper } = await mountComponent();

      const nameInput = wrapper.find<HTMLInputElement>('input:not([type="number"])');
      await nameInput.setValue('Test');

      await submitForm({ wrapper });

      const payload = createAccountMock.mock.calls[0]![0];
      expect(payload.accountCategory).toBe(ACCOUNT_CATEGORIES.general);
    });

    it('prefills with "saving" when route query has category=saving', async () => {
      const { wrapper } = await mountComponent({
        routeQuery: { category: ACCOUNT_CATEGORIES.saving },
      });

      const nameInput = wrapper.find<HTMLInputElement>('input:not([type="number"])');
      await nameInput.setValue('Savings Account');

      await submitForm({ wrapper });

      const payload = createAccountMock.mock.calls[0]![0];
      expect(payload.accountCategory).toBe(ACCOUNT_CATEGORIES.saving);
    });

    it('prefills with "creditCard" when route query has category=creditCard', async () => {
      const { wrapper } = await mountComponent({
        routeQuery: { category: ACCOUNT_CATEGORIES.creditCard },
      });

      const nameInput = wrapper.find<HTMLInputElement>('input:not([type="number"])');
      await nameInput.setValue('My Credit Card');

      await submitForm({ wrapper });

      const payload = createAccountMock.mock.calls[0]![0];
      expect(payload.accountCategory).toBe(ACCOUNT_CATEGORIES.creditCard);
    });
  });

  describe('4. Changing currency in the select updates the payload', () => {
    it('defaults to the base currency code', async () => {
      const { wrapper } = await mountComponent();

      const nameInput = wrapper.find<HTMLInputElement>('input:not([type="number"])');
      await nameInput.setValue('Test');

      await submitForm({ wrapper });

      const payload = createAccountMock.mock.calls[0]![0];
      // Base currency from mocks is UAH
      expect(payload.currencyCode).toBe(dataMocks.USER_BASE_CURRENCY.currencyCode);
    });

    it('updates currencyCode in payload when a different currency is selected', async () => {
      const { wrapper } = await mountComponent();

      // The currency Select uses a portal for its dropdown, which doesn't render
      // in jsdom. Instead, emit the update directly on the Select component.
      // The first Select.Select is the currency dropdown (see template order).
      const selectComponents = wrapper.findAllComponents(Select.Select);
      const currencySelect = selectComponents[0];

      const eurCurrency = dataMocks.USER_CURRENCIES.find((c) => c.currency!.code === 'EUR');
      currencySelect!.vm.$emit('update:modelValue', eurCurrency!.currencyCode);
      await wrapper.vm.$nextTick();

      const nameInput = wrapper.find<HTMLInputElement>('input:not([type="number"])');
      await nameInput.setValue('EUR Account');

      await submitForm({ wrapper });

      expect(createAccountMock).toHaveBeenCalledTimes(1);
      const payload = createAccountMock.mock.calls[0]![0];

      expect(payload.currencyCode).toBe(eurCurrency!.currencyCode);
    });
  });

  describe('5. Accounts and analytics are refetched after creation', () => {
    it('invalidates all transactionChange queries after successful creation', async () => {
      const { wrapper, queryClient } = await mountComponent();
      const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

      await submitForm({ wrapper });

      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        predicate: expect.any(Function),
      });

      // Verify the predicate matches transactionChange queries
      const { predicate } = invalidateQueriesSpy.mock.calls[0]![0] as { predicate: (query: unknown) => boolean };

      // Should match queries containing transactionChange (accounts, analytics, balance trend, etc.)
      expect(predicate({ queryKey: VUE_QUERY_CACHE_KEYS.allAccounts })).toBe(true);
      expect(predicate({ queryKey: VUE_QUERY_CACHE_KEYS.widgetBalanceTrend })).toBe(true);
      expect(predicate({ queryKey: VUE_QUERY_CACHE_KEYS.analyticsBalanceHistoryTrend })).toBe(true);

      // Should NOT match queries without transactionChange
      expect(predicate({ queryKey: VUE_QUERY_CACHE_KEYS.exchangeRates })).toBe(false);
      expect(predicate({ queryKey: VUE_QUERY_CACHE_KEYS.portfoliosList })).toBe(false);
    });
  });

  describe('6. Double-submit guard', () => {
    it('does not call createAccount again when Enter is pressed during loading', async () => {
      // Make createAccount return a promise that never resolves during the test
      let resolveCreateAccount: (value: Awaited<ReturnType<typeof api.createAccount>>) => void;
      createAccountMock.mockReturnValue(
        new Promise((resolve) => {
          resolveCreateAccount = resolve;
        }) as Promise<Awaited<ReturnType<typeof api.createAccount>>>,
      );

      const { wrapper } = await mountComponent();

      // First submit
      await wrapper.find('form').trigger('submit');
      await wrapper.vm.$nextTick();

      expect(createAccountMock).toHaveBeenCalledTimes(1);

      // Second submit (simulating Enter key during loading)
      await wrapper.find('form').trigger('submit');
      await wrapper.vm.$nextTick();

      // Should still be only 1 call
      expect(createAccountMock).toHaveBeenCalledTimes(1);

      // Clean up: resolve the pending promise to avoid unhandled rejection
      resolveCreateAccount!({} as Awaited<ReturnType<typeof api.createAccount>>);
    });
  });
});
