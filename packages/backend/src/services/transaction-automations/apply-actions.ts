import { type AutomationNoteMode, CATEGORIZATION_SOURCE } from '@bt/shared/types';
import TransactionAutomations from '@models/transaction-automations.model';
import TransactionTags from '@models/transaction-tags.model';
import * as Transactions from '@models/transactions.model';
import { DOMAIN_EVENTS, eventBus } from '@services/common/event-bus';

const MAX_NOTE_LENGTH = 2000;

export const buildNote = ({
  current,
  mode,
  value,
}: {
  current: string;
  mode: AutomationNoteMode;
  value: string;
}): string => {
  if (mode === 'replace') return value.trim().slice(0, MAX_NOTE_LENGTH);
  const merged = mode === 'append' ? `${current} ${value}` : `${value} ${current}`;
  return merged.trim().slice(0, MAX_NOTE_LENGTH);
};

/**
 * Runs a matched rule's actions against the re-fetched row; resolves to whether any
 * action was applied. Every write is conflict-free by construction: ids are pre-checked
 * against the owner and junction rows are inserted with `ignoreDuplicates`.
 */
export const applyActions = async ({
  transaction,
  rule,
  userId,
  skipSetCategory,
}: {
  transaction: Transactions.default;
  rule: TransactionAutomations;
  userId: number;
  skipSetCategory: boolean;
}): Promise<boolean> => {
  let applied = false;

  for (const action of rule.actions) {
    switch (action.type) {
      case 'set_category': {
        if (skipSetCategory || transaction.categorizationMeta?.source === CATEGORIZATION_SOURCE.subscriptionRule) {
          continue;
        }

        await Transactions.updateTransactionById({
          id: transaction.id,
          userId,
          categoryId: action.categoryId,
          categorizationMeta: {
            source: CATEGORIZATION_SOURCE.userRule,
            ruleId: rule.id,
            categorizedAt: new Date().toISOString(),
          },
        });
        break;
      }
      case 'add_tags': {
        await TransactionTags.bulkCreate(
          action.tagIds.map((tagId) => ({ tagId, transactionId: transaction.id })),
          { ignoreDuplicates: true },
        );

        // Junction-only writes leave the row's timestamp untouched, so clients can't
        // detect the change. Sequelize skips a bulk update whose only value is
        // `updatedAt`, hence the instance save.
        transaction.changed('updatedAt', true);
        await transaction.save();

        eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_TAGGED, { tagIds: action.tagIds, userId });
        break;
      }
      case 'set_payee':
        await Transactions.updateTransactionById({
          id: transaction.id,
          userId,
          payeeId: action.payeeId,
          payeeLocked: true,
        });
        break;
      case 'set_note':
        await Transactions.updateTransactionById({
          id: transaction.id,
          userId,
          note: buildNote({ current: transaction.note ?? '', mode: action.mode, value: action.value }),
        });
        break;
      default:
        action satisfies never;
    }
    applied = true;
  }

  return applied;
};
