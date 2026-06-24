import { Money } from '@common/types/money';
import { ValidationError } from '@js/errors';
import * as Accounts from '@models/accounts.model';
import { withTransaction } from '@services/common/with-transaction';

import { convertSubscriptionAmountToAccountCurrency } from './convert-subscription-amount';
import { findSubscriptionOrThrow } from './helpers';

export interface SubscriptionPayPreview {
  /** True when the subscription's billed currency differs from its account's currency. */
  isCrossCurrency: boolean;
  /** ISO code the booked expense will be denominated in (the account's currency), or null when no account is linked. */
  accountCurrencyCode: string | null;
  /** ISO code the subscription is billed in. */
  subscriptionCurrencyCode: string | null;
  /** Billed amount in the subscription's own currency (decimal), or null for a variable-amount subscription. */
  expectedAmount: number | null;
  /**
   * Billed amount converted into the account currency at today's rate (decimal),
   * used to pre-fill the pay dialog. Null when there is nothing to convert (no
   * account or no expectedAmount).
   */
  convertedAmount: number | null;
}

/**
 * Returns what paying a subscription would book, so the pay dialog can pre-fill
 * the amount. Uses `convertSubscriptionAmountToAccountCurrency` — the same
 * function the actual booking uses — guaranteeing the previewed figure matches
 * the booked expense.
 */
export const getSubscriptionPayPreview = withTransaction(
  async ({ userId, subscriptionId }: { userId: number; subscriptionId: string }): Promise<SubscriptionPayPreview> => {
    const subscription = await findSubscriptionOrThrow({ id: subscriptionId, userId });

    // expectedAmount on the model is raw cents (BIGINT); wrap in Money to get the decimal for the API.
    const expectedAmount =
      subscription.expectedAmount != null ? Money.fromCents(subscription.expectedAmount).toNumber() : null;

    if (subscription.accountId == null) {
      return {
        isCrossCurrency: false,
        accountCurrencyCode: null,
        subscriptionCurrencyCode: subscription.expectedCurrencyCode,
        expectedAmount,
        convertedAmount: null,
      };
    }

    const account = await Accounts.getAccountCurrency({ userId, id: subscription.accountId });
    if (account == null) {
      throw new ValidationError({
        message: 'A created transaction requires an account on the subscription.',
      });
    }
    const accountCurrencyCode = account.currency.code;
    const isCrossCurrency =
      subscription.expectedCurrencyCode != null && subscription.expectedCurrencyCode !== accountCurrencyCode;

    const converted = await convertSubscriptionAmountToAccountCurrency({
      subscription,
      accountCurrencyCode,
      date: new Date(),
    });

    return {
      isCrossCurrency,
      accountCurrencyCode,
      subscriptionCurrencyCode: subscription.expectedCurrencyCode,
      expectedAmount,
      convertedAmount: converted != null ? converted.toNumber() : null,
    };
  },
);
