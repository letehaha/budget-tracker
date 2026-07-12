import { SubscriptionMatchingRules } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import * as Accounts from '@models/accounts.model';
import Categories from '@models/categories.model';
import Subscriptions from '@models/subscriptions.model';

/**
 * A monetary amount is meaningless without its currency, and the pay path treats
 * a null currency as "same as the account" (booking the raw figure unconverted).
 * So `expectedAmount` and `expectedCurrencyCode` must travel together: both set
 * or both null. Enforced in the service layer (the HTTP controllers check too,
 * but MCP callers reach the service directly). Pass the merged post-update
 * values; only their null-ness matters, so cents-vs-decimal is irrelevant here.
 */
export const assertAmountCurrencyConsistent = ({
  expectedAmount,
  expectedCurrencyCode,
}: {
  expectedAmount: Money | number | null | undefined;
  expectedCurrencyCode: string | null | undefined;
}): void => {
  const hasAmount = expectedAmount != null;
  const hasCurrency = expectedCurrencyCode != null;

  if (hasAmount !== hasCurrency) {
    throw new ValidationError({
      message: 'expectedAmount and expectedCurrencyCode must be provided together (both set, or both omitted).',
    });
  }
};

export const findSubscriptionOrThrow = async ({ id, userId }: { id: string; userId: number }) => {
  return findOrThrowNotFound({
    query: Subscriptions.findOne({ where: { id, userId } }),
    message: 'Subscription not found.',
  });
};

export const validateAccountOwnership = async ({ accountId, userId }: { accountId: string; userId: number }) => {
  await findOrThrowNotFound({
    query: Accounts.getAccountById({ userId, id: accountId }),
    message: 'Account not found or does not belong to user.',
  });
};

export const validateCategoryOwnership = async ({ categoryId, userId }: { categoryId: string; userId: number }) => {
  await findOrThrowNotFound({
    query: Categories.findOne({ where: { id: categoryId, userId } }),
    message: 'Category not found or does not belong to user.',
  });
};

/**
 * Auto-record hands `markPeriodPaid` the booking inputs every tick (CREATE mode
 * needs account + amount + currency). Without them the cron would throw on every
 * run. Matching rules and auto-record both produce a "settling" transaction for
 * the same period — auto-record on the dueDate, matching on the next bank
 * import — so allowing both leaves the user with a duplicate to clean up; reject
 * the pair at the boundary instead. Pass the merged post-update values so a
 * partial PATCH still validates against the eventual stored state. DB CHECK
 * constraints repeat both rules as defence-in-depth (MCP/SQL bypasses can't
 * smuggle past them).
 */
export const assertAutoRecordConsistent = ({
  autoRecord,
  accountId,
  expectedAmount,
  expectedCurrencyCode,
  matchingRules,
}: {
  autoRecord: boolean;
  accountId: string | null | undefined;
  expectedAmount: Money | number | null | undefined;
  expectedCurrencyCode: string | null | undefined;
  matchingRules: SubscriptionMatchingRules | null | undefined;
}): void => {
  if (!autoRecord) return;

  if (accountId == null) {
    throw new ValidationError({
      message: t({ key: 'subscriptions.validation.autoRecord.requiresAccount' }),
    });
  }
  if (expectedAmount == null || expectedCurrencyCode == null) {
    throw new ValidationError({
      message: t({ key: 'subscriptions.validation.autoRecord.requiresAmount' }),
    });
  }
  if ((matchingRules?.rules?.length ?? 0) > 0) {
    throw new ValidationError({
      message: t({ key: 'subscriptions.validation.autoRecord.excludesMatching' }),
    });
  }
};
