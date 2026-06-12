import { logger } from '@js/utils/logger';
import PayeeTags from '@models/payee-tags.model';
import Payees from '@models/payees.model';
import TransactionTags from '@models/transaction-tags.model';
import Transactions from '@models/transactions.model';
import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';

import { withTransaction } from '../common/with-transaction';

interface ApplyPayeeDefaultTagsParams {
  /**
   * Owner of the account the row lives on — scopes the Payee lookup, same
   * contract as `applyPayeeCategorization`. The caller is expected to have
   * already authorized the write against this transaction.
   */
  accountOwnerUserId: number;
  transactionId: string;
  payeeId: string;
}

/**
 * Apply a Payee's default tags onto a transaction. Add-only merge: existing
 * tags on the row are never removed, duplicates are skipped via the
 * `TransactionTags` composite PK. Shared by the transaction-creation path
 * (`create-transaction`, manual + sync) and the post-sync note fuzzy backfill.
 *
 * Callers gate this on the transaction having NO caller-supplied tag list —
 * an explicit `tagIds` (even an empty array) means the client already decided
 * the final tag set, e.g. the transaction form applies payee tags client-side
 * and the user may have deselected some of them.
 *
 * Returns the Payee's rule tag ids (the set attempted for the row — tags
 * already present are silently skipped). Empty when the Payee has no rule or
 * the row disappeared concurrently.
 */
export const applyPayeeDefaultTags = withTransaction(
  async ({ accountOwnerUserId, transactionId, payeeId }: ApplyPayeeDefaultTagsParams): Promise<string[]> => {
    const payee = await Payees.findOne({
      where: { id: payeeId, userId: accountOwnerUserId },
      attributes: ['id'],
    });
    if (!payee) {
      // Callers resolve the payeeId against the account owner right before
      // calling — a miss here means a concurrent delete or a scoping bug,
      // not a normal "no rule" case. Worth a trace.
      logger.warn('applyPayeeDefaultTags: payee not found for account owner; skipping', {
        payeeId,
        accountOwnerUserId,
        transactionId,
      });
      return [];
    }

    const ruleRows = await PayeeTags.findAll({ where: { payeeId }, attributes: ['tagId'] });
    if (ruleRows.length === 0) return [];

    const latest = await Transactions.findByPk(transactionId, { attributes: ['id'] });
    if (!latest) {
      // Same anomaly class: the caller just created/updated this row, so a
      // missing PK indicates a concurrent delete, not a normal path.
      logger.warn('applyPayeeDefaultTags: transaction disappeared before tagging; skipping', {
        payeeId,
        transactionId,
      });
      return [];
    }

    const tagIds = ruleRows.map((row) => row.tagId);
    await TransactionTags.bulkCreate(
      tagIds.map((tagId) => ({ tagId, transactionId })),
      { ignoreDuplicates: true },
    );

    // Real-time tag-reminder check, same as the manual tagging paths.
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_TAGGED, { tagIds, userId: accountOwnerUserId });

    return tagIds;
  },
);
