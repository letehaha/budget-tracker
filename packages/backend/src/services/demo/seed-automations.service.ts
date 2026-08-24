import { type AutomationAction, type AutomationConditions, type RecordId, TRANSACTION_TYPES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import { createAutomation } from '@services/transaction-automations/create-automation';
import { subDays } from 'date-fns';

import { DEMO_CONFIG, type DemoAccountKey } from './demo-config';
import { DEMO_MERCHANTS, INSTITUTIONAL_MERCHANTS } from './template/merchants';

interface DemoAutomationRefs {
  category: (key: string) => RecordId;
  tag: (key: string) => RecordId;
  payee: (name: string) => RecordId;
  account: (key: DemoAccountKey) => RecordId;
  accountGroup: (name: string) => RecordId;
}

interface DemoAutomation {
  name: string;
  isEnabled?: boolean;
  conditions: AutomationConditions;
  actions: AutomationAction[];
  /** Seeded match history; without it every row reads "never matched". */
  matchCount: number;
  lastMatchedDaysAgo: number;
}

/**
 * Each action type and each condition field a demo user can reference (no bank
 * connection) appears at least once. Keywords come from the demo merchant vocabulary.
 */
const DEMO_AUTOMATIONS: Array<({ refs }: { refs: DemoAutomationRefs }) => DemoAutomation> = [
  ({ refs }) => ({
    name: 'Rideshare → Taxi',
    conditions: {
      match: 'any',
      items: [
        { field: 'merchant', operator: 'contains_any', value: ['uber', 'lyft', 'bolt'] },
        { field: 'payee', operator: 'in', value: ['Uber', 'Lyft', 'Bolt'].map(refs.payee) },
      ],
    },
    actions: [{ type: 'set_category', categoryId: refs.category('transportation/taxi') }],
    matchCount: 214,
    lastMatchedDaysAgo: 2,
  }),
  ({ refs }) => ({
    name: 'Coffee runs',
    conditions: {
      match: 'all',
      items: [{ field: 'merchant', operator: 'contains_any', value: ['starbucks', 'dunkin', 'peet', 'blue bottle'] }],
    },
    actions: [
      { type: 'set_category', categoryId: refs.category('food/bar-cafe') },
      { type: 'add_tags', tagIds: [refs.tag('want')] },
    ],
    matchCount: 187,
    lastMatchedDaysAgo: 1,
  }),
  ({ refs }) => ({
    name: 'Grocery stores',
    conditions: {
      match: 'all',
      items: [
        {
          field: 'payee',
          operator: 'in',
          value: [...DEMO_MERCHANTS.groceries.map(({ name }) => name), 'Żabka', 'Biedronka'].map(refs.payee),
        },
      ],
    },
    actions: [
      { type: 'set_category', categoryId: refs.category('food/groceries') },
      { type: 'add_tags', tagIds: [refs.tag('need')] },
    ],
    matchCount: 342,
    lastMatchedDaysAgo: 3,
  }),
  ({ refs }) => ({
    name: 'Acme payroll',
    conditions: {
      match: 'all',
      items: [
        { field: 'transactionType', operator: 'equals', value: TRANSACTION_TYPES.income },
        { field: 'merchant', operator: 'contains_any', value: ['acme'] },
      ],
    },
    actions: [
      { type: 'set_category', categoryId: refs.category('income/wage-invoices') },
      { type: 'set_payee', payeeId: refs.payee(INSTITUTIONAL_MERCHANTS.employer.name) },
      { type: 'set_note', mode: 'replace', value: 'Monthly salary' },
    ],
    matchCount: 36,
    lastMatchedDaysAgo: 12,
  }),
  ({ refs }) => ({
    name: 'Tag subscriptions',
    conditions: {
      match: 'all',
      items: [
        {
          field: 'merchant',
          operator: 'contains_any',
          value: DEMO_CONFIG.subscriptions.flatMap((subscription) => subscription.matchKeywords),
        },
      ],
    },
    actions: [{ type: 'add_tags', tagIds: [refs.tag('subscription')] }],
    matchCount: 252,
    lastMatchedDaysAgo: 4,
  }),
  ({ refs }) => ({
    name: 'Travel accounts → Vacation',
    conditions: {
      match: 'all',
      items: [
        { field: 'accountGroup', operator: 'in', value: [refs.accountGroup('Travel')] },
        { field: 'transactionType', operator: 'equals', value: TRANSACTION_TYPES.expense },
      ],
    },
    actions: [{ type: 'add_tags', tagIds: [refs.tag('vacation')] }],
    matchCount: 96,
    lastMatchedDaysAgo: 20,
  }),
  ({ refs }) => ({
    name: 'Flag big purchases',
    conditions: {
      match: 'all',
      items: [
        { field: 'transactionType', operator: 'equals', value: TRANSACTION_TYPES.expense },
        { field: 'amount', operator: 'gte', value: { min: 500 }, currency: { mode: 'base' } },
        { field: 'account', operator: 'in', value: [refs.account('main_checking'), refs.account('travel_card')] },
      ],
    },
    actions: [{ type: 'set_note', mode: 'prepend', value: 'Review:' }],
    matchCount: 41,
    lastMatchedDaysAgo: 5,
  }),
  ({ refs }) => ({
    name: 'Rent on the 5th',
    conditions: {
      match: 'all',
      items: [
        { field: 'note', operator: 'contains_any', value: ['rent'] },
        { field: 'dayOfMonth', operator: 'between', value: { min: 1, max: 7 } },
        {
          field: 'amount',
          operator: 'between',
          value: { min: 1300, max: 1500 },
          currency: { mode: 'specific', code: 'USD' },
        },
      ],
    },
    actions: [
      { type: 'set_category', categoryId: refs.category('housing/rent') },
      { type: 'set_payee', payeeId: refs.payee(INSTITUTIONAL_MERCHANTS.landlord.name) },
      { type: 'add_tags', tagIds: [refs.tag('must')] },
    ],
    matchCount: 36,
    lastMatchedDaysAgo: 17,
  }),
  ({ refs }) => ({
    name: 'Bank fees',
    conditions: {
      match: 'any',
      items: [
        { field: 'merchant', operator: 'contains_any', value: ['maintenance fee', 'service charge', 'overdraft'] },
        { field: 'payee', operator: 'in', value: [refs.payee(INSTITUTIONAL_MERCHANTS.bank.name)] },
      ],
    },
    actions: [
      { type: 'set_category', categoryId: refs.category('financial-expenses/charges-fees') },
      { type: 'set_payee', payeeId: refs.payee(INSTITUTIONAL_MERCHANTS.bank.name) },
    ],
    matchCount: 36,
    lastMatchedDaysAgo: 15,
  }),
  ({ refs }) => ({
    name: 'Work expenses',
    isEnabled: false,
    conditions: {
      match: 'all',
      items: [
        { field: 'note', operator: 'contains_any', value: ['client', 'work trip', 'conference'] },
        { field: 'transactionType', operator: 'equals', value: TRANSACTION_TYPES.expense },
      ],
    },
    actions: [
      { type: 'add_tags', tagIds: [refs.tag('reimbursable')] },
      { type: 'set_note', mode: 'append', value: '(submit expense report)' },
    ],
    matchCount: 8,
    lastMatchedDaysAgo: 64,
  }),
];

function lookup<K extends string>({ kind, get }: { kind: string; get: (key: K) => string | undefined }) {
  return (key: K): RecordId => {
    const id = get(key);
    if (!id) throw new Error(`Demo automation references unknown ${kind} "${key}"`);
    return id as RecordId;
  };
}

/** Goes through `createAutomation` so each rule gets its position and a reference check. */
export async function setupAutomations({
  userId,
  referenceDate,
  categoryMap,
  tagMap,
  payeeMap,
  accountKeyToId,
  accountGroupIdByName,
}: {
  userId: number;
  referenceDate: Date;
  categoryMap: Map<string, string>;
  tagMap: Map<string, string>;
  payeeMap: Map<string, string>;
  accountKeyToId: Partial<Record<DemoAccountKey, string>>;
  accountGroupIdByName: Map<string, string>;
}): Promise<void> {
  const refs: DemoAutomationRefs = {
    category: lookup({ kind: 'category', get: (key) => categoryMap.get(key) }),
    tag: lookup({ kind: 'tag', get: (key) => tagMap.get(key) }),
    payee: lookup({ kind: 'payee', get: (name) => payeeMap.get(name) }),
    account: lookup({ kind: 'account', get: (key) => accountKeyToId[key] }),
    accountGroup: lookup({ kind: 'account group', get: (name) => accountGroupIdByName.get(name) }),
  };

  let created = 0;
  for (const build of DEMO_AUTOMATIONS) {
    try {
      const rule = build({ refs });
      const automation = await createAutomation({
        userId,
        name: rule.name,
        isEnabled: rule.isEnabled,
        conditions: rule.conditions,
        actions: rule.actions,
      });
      created += 1;
      await automation.update({
        matchCount: rule.matchCount,
        lastMatchedAt: subDays(referenceDate, rule.lastMatchedDaysAgo),
      });
    } catch (error) {
      // Throw outside prod so a stale key fails tests; in prod the signup must still complete.
      if (process.env.NODE_ENV !== 'production') throw error;
      logger.error(`Demo automation skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  logger.info(`Created ${created} of ${DEMO_AUTOMATIONS.length} demo automations for user ${userId}`);
}
