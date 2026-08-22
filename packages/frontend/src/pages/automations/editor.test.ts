import * as accountGroupsApi from '@/api/account-groups';
import * as bankProvidersApi from '@/api/bank-data-providers';
import * as payeesApi from '@/api/payees';
import * as automationsApi from '@/api/transaction-automations';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import { ROUTES_NAMES } from '@/routes/constants';
import { useTagsStore } from '@/stores';
import { TRANSACTION_TYPES, type TransactionAutomationModel } from '@bt/shared/types';
import { createTestingPinia } from '@pinia/testing';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import * as dataMocks from '@tests/mocks';
import { type VueWrapper, flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { createI18n } from 'vue-i18n';
import { RouterView, createMemoryHistory, createRouter } from 'vue-router';

import ConditionRow from './components/condition-row.vue';
import Editor from './editor.vue';

vi.mock('@/api/transaction-automations', async (importOriginal) => ({
  ...(await importOriginal<typeof automationsApi>()),
  loadTransactionAutomations: vi.fn(),
  createTransactionAutomation: vi.fn(),
  updateTransactionAutomation: vi.fn(),
}));
vi.mock('@/api/account-groups', async (importOriginal) => ({
  ...(await importOriginal<typeof accountGroupsApi>()),
  loadAccountGroups: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/api/bank-data-providers', async (importOriginal) => ({
  ...(await importOriginal<typeof bankProvidersApi>()),
  listConnections: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/api/payees', async (importOriginal) => ({
  ...(await importOriginal<typeof payeesApi>()),
  loadPayeeLookup: vi.fn().mockResolvedValue([]),
}));

// jsdom ships neither; tooltips read hover capability and radix primitives observe sizes.
vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const loadMock = vi.mocked(automationsApi.loadTransactionAutomations);
const createMock = vi.mocked(automationsApi.createTransactionAutomation);
const updateMock = vi.mocked(automationsApi.updateTransactionAutomation);

const CATEGORY = dataMocks.USER_CATEGORIES[0]!;

const RULE: TransactionAutomationModel = {
  id: 'rule-1' as TransactionAutomationModel['id'],
  userId: dataMocks.USER.id,
  name: 'Salary',
  isEnabled: false,
  position: 0,
  conditions: {
    match: 'any',
    items: [
      {
        field: 'amount',
        operator: 'between',
        value: { min: 4500, max: 5500 },
        currency: { mode: 'specific', code: 'EUR' },
      },
      { field: 'transactionType', operator: 'equals', value: TRANSACTION_TYPES.expense },
    ],
  },
  actions: [
    { type: 'set_category', categoryId: CATEGORY.id },
    { type: 'set_note', mode: 'append', value: 'Payroll' },
  ],
  matchCount: 0,
  lastMatchedAt: null,
  pausedReason: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Only interpolated messages need real text: `i18n-t` mounts its slots from the placeholders.
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  missingWarn: false,
  fallbackWarn: false,
  messages: { en: { automations: { editor: { conditionsHeader: 'Match {match} of these conditions' } } } },
});

const Stub = { template: '<div />' };

// Rendered through RouterView so useRoute params and onBeforeRouteLeave behave as in the app.
const mountEditor = async ({ path }: { path: string }) => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/transactions/automations', name: ROUTES_NAMES.automations, component: Stub },
      { path: '/transactions/automations/new', name: ROUTES_NAMES.automationCreate, component: Editor },
      { path: '/transactions/automations/:id', name: ROUTES_NAMES.automationDetails, component: Editor },
    ],
  });
  await router.push(path);

  const pinia = createTestingPinia({
    createSpy: vi.fn,
    initialState: {
      user: { user: dataMocks.USER },
      currencies: {
        currencies: dataMocks.USER_CURRENCIES,
        systemCurrencies: dataMocks.SYSTEM_CURRENCIES,
        baseCurrency: dataMocks.USER_BASE_CURRENCY,
      },
      categories: { categories: dataMocks.USER_CATEGORIES },
    },
  });
  // Stubbed actions return undefined; the editor chains `.catch` on this one.
  vi.mocked(useTagsStore(pinia).loadTags).mockResolvedValue();

  const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: {
      plugins: [
        pinia,
        [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }],
        router,
        i18n,
      ],
    },
  });
  await flushPromises();

  return { wrapper, router };
};

const nameInput = ({ wrapper }: { wrapper: VueWrapper }) =>
  wrapper.find<HTMLInputElement>('input[placeholder="automations.editor.namePlaceholder"]');

const clickButton = async ({ wrapper, text }: { wrapper: VueWrapper; text: string }) => {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text);
  expect(button, `button "${text}"`).toBeDefined();
  await button!.trigger('click');
  await flushPromises();
};

const isActivePill = ({ wrapper, value }: { wrapper: VueWrapper; value: string }) =>
  wrapper.find(`button[data-value="${value}"]`).classes().includes('text-foreground');

describe('automation editor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadMock.mockResolvedValue([]);
    createMock.mockResolvedValue(RULE);
    updateMock.mockResolvedValue(RULE);
  });

  it('create: sends the assembled payload and returns to the list', async () => {
    const { wrapper, router } = await mountEditor({ path: '/transactions/automations/new' });

    await nameInput({ wrapper }).setValue('  Groceries  ');
    await wrapper.find('[role="switch"]').trigger('click');
    await clickButton({ wrapper, text: 'automations.editor.matchAny' });

    const keyword = wrapper.find('input[placeholder="automations.editor.keywordPlaceholder"]');
    await keyword.setValue('biedronka');
    await keyword.trigger('keydown', { key: 'Enter' });

    await clickButton({ wrapper, text: 'automations.editor.addCondition' });
    wrapper.findAllComponents(ConditionRow)[1]!.vm.$emit('update:field', 'amount');
    await flushPromises();
    await wrapper.find('input[type="number"]').setValue('50');

    wrapper.findComponent(CategorySelectField).vm.$emit('update:modelValue', CATEGORY);
    await flushPromises();

    await clickButton({ wrapper, text: 'common.actions.save' });

    expect(updateMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0]![0]).toEqual({
      payload: {
        name: 'Groceries',
        isEnabled: false,
        conditions: {
          match: 'any',
          items: [
            { field: 'note', operator: 'contains_any', value: ['biedronka'] },
            { field: 'amount', operator: 'gte', value: { min: 50 }, currency: { mode: 'transaction' } },
          ],
        },
        actions: [{ type: 'set_category', categoryId: CATEGORY.id }],
      },
    });
    expect(router.currentRoute.value.name).toBe(ROUTES_NAMES.automations);
  });

  it('edit: populates the form from the loaded rule and round-trips it unchanged', async () => {
    loadMock.mockResolvedValue([RULE]);
    const { wrapper } = await mountEditor({ path: `/transactions/automations/${RULE.id}` });

    expect(nameInput({ wrapper }).element.value).toBe('Salary');
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');
    expect(isActivePill({ wrapper, value: 'any' })).toBe(true);

    const rows = wrapper.findAllComponents(ConditionRow);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.props('modelValue')).toEqual(RULE.conditions.items[0]);
    expect(rows[1]!.props('modelValue')).toEqual(RULE.conditions.items[1]);
    expect(wrapper.findAll<HTMLInputElement>('input[type="number"]').map((input) => input.element.value)).toEqual([
      '4500',
      '5500',
    ]);
    expect(isActivePill({ wrapper, value: TRANSACTION_TYPES.expense })).toBe(true);

    expect(wrapper.findComponent(CategorySelectField).props('modelValue')).toMatchObject({ id: CATEGORY.id });
    expect(wrapper.text()).toContain(CATEGORY.name);
    expect(isActivePill({ wrapper, value: 'append' })).toBe(true);
    expect(
      wrapper.find<HTMLInputElement>('input[placeholder="automations.editor.notePlaceholder"]').element.value,
    ).toBe('Payroll');

    await clickButton({ wrapper, text: 'common.actions.save' });

    expect(createMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0]).toEqual({
      id: RULE.id,
      payload: { name: RULE.name, isEnabled: RULE.isEnabled, conditions: RULE.conditions, actions: RULE.actions },
    });
  });

  it('create: an invalid form shows errors and never calls the API', async () => {
    const { wrapper } = await mountEditor({ path: '/transactions/automations/new' });

    await clickButton({ wrapper, text: 'common.actions.save' });

    expect(createMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('automations.editor.errors.nameRequired');
  });
});
