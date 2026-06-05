import { logger } from '@js/utils/logger';
import Accounts from '@models/accounts.model';
import * as Transactions from '@models/transactions.model';
import { DOMAIN_EVENTS, TransactionsSyncedPayload, eventBus } from '@services/common/event-bus';
import debounce from 'lodash/debounce';

import { matchTransactionToSubscriptions } from './matching-engine';

const DEBOUNCE_DELAY_MS = 5_000;
const MAX_WAIT_MS = 15_000;

const pendingByUser = new Map<number, Set<string>>();

const processMatching = debounce(
  async () => {
    const usersToProcess = new Map(pendingByUser);
    pendingByUser.clear();

    for (const [userId, transactionIds] of usersToProcess) {
      const ids = Array.from(transactionIds);
      if (ids.length === 0) continue;

      try {
        for (const txId of ids) {
          // Fetch by id with an Accounts JOIN scoped to `userId` (the
          // pass user = account owner). Subscriptions are owner-scoped,
          // so we only want to match rows on accounts this user owns —
          // regardless of who authored each row. The earlier `{id, userId}`
          // filter implicitly assumed `row.userId == account.userId`,
          // which holds for current bank-sync emit sites but would
          // silently skip cross-creator rows on a shared account if any
          // future emit site sent mixed-author batches.
          const transaction = await Transactions.default.findOne({
            where: { id: txId },
            include: [
              {
                model: Accounts,
                where: { userId },
                required: true,
                attributes: [],
              },
            ],
          });

          if (!transaction) continue;

          await matchTransactionToSubscriptions({ transaction, userId });
        }
      } catch (error) {
        logger.error({
          message: 'Failed to match transactions to subscriptions',
          error: error as Error,
        });
      }
    }
  },
  DEBOUNCE_DELAY_MS,
  { maxWait: MAX_WAIT_MS },
);

export function registerSubscriptionMatchingListeners(): void {
  eventBus.on(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, handleTransactionsSynced);
  logger.info('Subscription matching event listeners registered');
}

function handleTransactionsSynced(payload: TransactionsSyncedPayload): void {
  const { userId, transactionIds } = payload;
  if (transactionIds.length === 0) return;

  let userTxIds = pendingByUser.get(userId);
  if (!userTxIds) {
    userTxIds = new Set<string>();
    pendingByUser.set(userId, userTxIds);
  }

  for (const txId of transactionIds) {
    userTxIds.add(txId);
  }

  processMatching();
}
