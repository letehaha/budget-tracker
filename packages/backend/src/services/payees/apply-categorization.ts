import { CATEGORIZATION_MODE, CATEGORIZATION_SOURCE } from '@bt/shared/types';
import Payees from '@models/payees.model';
import * as Transactions from '@models/transactions.model';

import { withTransaction } from '../common/with-transaction';

interface ApplyPayeeCategorizationParams {
  userId: number;
  transactionId: string;
  payeeId: string;
}

/**
 * Apply a Payee's default category onto a transaction, gated by the Payee's
 * `categorizationMode`. Shared by the create path (immediately after the row
 * is inserted with a resolved `payeeId`) and Type B (after a fuzzy note-based
 * link). Keeping the rule here is what guarantees a row linked via either
 * path stamps `categorizationMeta` consistently — Type B used to link without
 * stamping, letting the AI listener re-categorize an `enforce`-mode Payee.
 *
 * The "overridable" gate looks at the currently-committed `categorizationMeta`
 * (re-fetched, since subscription matching may have run in between): only
 * `mccRule`, `ai`, and `null` get overridden. Higher-precedence sources
 * (`manual`, `userRule`, `subscriptionRule`, and an existing `payeeRule`) are
 * left alone.
 *
 * Returns the updated transaction, the unchanged latest row when nothing
 * applied, or `null` if the row was deleted concurrently.
 */
export const applyPayeeCategorization = withTransaction(
  async ({ userId, transactionId, payeeId }: ApplyPayeeCategorizationParams): Promise<Transactions.default | null> => {
    const latest = await Transactions.getTransactionById({ id: transactionId, userId });
    if (!latest) return null;

    const meta = latest.categorizationMeta ?? null;
    const overridable =
      !meta || meta.source === CATEGORIZATION_SOURCE.mccRule || meta.source === CATEGORIZATION_SOURCE.ai;
    if (!overridable) return latest;

    const payee = await Payees.findOne({
      where: { id: payeeId, userId },
      attributes: ['id', 'defaultCategoryId', 'categorizationMode'],
    });
    if (!payee?.defaultCategoryId || payee.categorizationMode === CATEGORIZATION_MODE.off) {
      return latest;
    }

    // `enforce` stamps meta so the AI categorization listener's "meta IS NULL"
    // filter skips the row. `hint` leaves meta null so AI may still override
    // based on the description — right for catch-all merchants (Amazon,
    // Walmart) where the default is a fallback but per-tx context matters.
    const enforceMeta = payee.categorizationMode === CATEGORIZATION_MODE.enforce;
    const updated = await Transactions.updateTransactionById({
      id: transactionId,
      userId,
      categoryId: payee.defaultCategoryId,
      categorizationMeta: enforceMeta
        ? {
            source: CATEGORIZATION_SOURCE.payeeRule,
            payeeId: payee.id,
            categorizedAt: new Date().toISOString(),
          }
        : null,
    });
    return updated ?? latest;
  },
);
