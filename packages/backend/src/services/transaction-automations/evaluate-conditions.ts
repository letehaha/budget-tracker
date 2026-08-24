import {
  AutomationAmountCurrency,
  AutomationAmountOperator,
  AutomationCondition,
  AutomationConditions,
  AutomationListOperator,
  AutomationTextOperator,
  RecordId,
} from '@bt/shared/types';
import { Money } from '@common/types/money';

import { AutomationContext } from './build-context';

const matchText = ({
  value,
  operator,
  keywords,
}: {
  value: string;
  operator: AutomationTextOperator;
  keywords: string[];
}): boolean => {
  const haystack = value.toLowerCase();
  if (operator === 'is_empty') return haystack.trim() === '';

  const needles = keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean);

  switch (operator) {
    case 'contains_any':
      return needles.some((needle) => haystack.includes(needle));
    case 'not_contains_any':
      return !needles.some((needle) => haystack.includes(needle));
    case 'starts_with_any':
      return needles.some((needle) => haystack.startsWith(needle));
    case 'ends_with_any':
      return needles.some((needle) => haystack.endsWith(needle));
    case 'equals_any':
      return needles.some((needle) => haystack === needle);
  }
};

const matchIds = ({
  values,
  operator,
  ids,
}: {
  values: RecordId[];
  operator: AutomationListOperator;
  ids: RecordId[];
}): boolean => {
  const present = values.some((value) => ids.includes(value));
  return operator === 'in' ? present : !present;
};

const resolveAmountCents = ({
  ctx,
  currency,
}: {
  ctx: AutomationContext;
  currency: AutomationAmountCurrency;
}): number | null => {
  if (currency.mode === 'transaction') return ctx.amountCents;
  if (currency.mode === 'base') return ctx.refAmountCents;
  return currency.code === ctx.currencyCode ? ctx.amountCents : null;
};

const compareAmount = ({
  cents,
  operator,
  value,
}: {
  cents: number;
  operator: AutomationAmountOperator;
  value: { min?: number; max?: number };
}): boolean => {
  const min = value.min === undefined ? undefined : Money.fromDecimal(value.min).toCents();
  const max = value.max === undefined ? undefined : Money.fromDecimal(value.max).toCents();

  switch (operator) {
    case 'between':
      return min !== undefined && max !== undefined && cents >= min && cents <= max;
    case 'gte':
      return min !== undefined && cents >= min;
    case 'lte':
      return max !== undefined && cents <= max;
    case 'equals':
      return min !== undefined && cents === min;
  }
};

const evaluateItem = async ({ ctx, item }: { ctx: AutomationContext; item: AutomationCondition }): Promise<boolean> => {
  switch (item.field) {
    case 'note':
      return matchText({ value: ctx.note, operator: item.operator, keywords: item.value });
    case 'merchant':
      return matchText({ value: ctx.merchant, operator: item.operator, keywords: item.value });
    case 'payee':
      return matchIds({ values: ctx.payeeId ? [ctx.payeeId] : [], operator: item.operator, ids: item.value });
    case 'amount': {
      const cents = resolveAmountCents({ ctx, currency: item.currency });
      return cents !== null && compareAmount({ cents, operator: item.operator, value: item.value });
    }
    case 'transactionType':
      return ctx.transactionType === item.value;
    case 'account':
      return matchIds({ values: [ctx.accountId], operator: item.operator, ids: item.value });
    case 'accountGroup':
      return matchIds({ values: await ctx.accountGroupIds(), operator: item.operator, ids: item.value });
    case 'bankConnection': {
      const connectionId = await ctx.bankConnectionId();
      return matchIds({ values: connectionId ? [connectionId] : [], operator: item.operator, ids: item.value });
    }
    case 'dayOfMonth':
      return ctx.dayOfMonth >= item.value.min && ctx.dayOfMonth <= item.value.max;
  }
};

/**
 * All IO goes through `ctx`'s lazy loaders, so this stays a pure function of the
 * context. `perItem` covers only the items reached before the short-circuit.
 */
export const evaluateConditions = async ({
  ctx,
  conditions,
}: {
  ctx: AutomationContext;
  conditions: AutomationConditions;
}): Promise<{ matched: boolean; perItem: boolean[] }> => {
  const perItem: boolean[] = [];

  for (const item of conditions.items) {
    const result = await evaluateItem({ ctx, item });
    perItem.push(result);

    if (conditions.match === 'all' && !result) return { matched: false, perItem };
    if (conditions.match === 'any' && result) return { matched: true, perItem };
  }

  return { matched: conditions.match === 'all', perItem };
};
