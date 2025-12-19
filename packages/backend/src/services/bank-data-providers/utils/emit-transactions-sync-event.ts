import { logger } from '@js/utils';
import { DOMAIN_EVENTS, type TransactionsSyncedPayload, eventBus } from '@root/services/common/event-bus';

export const emitTransactionsSyncEvent = ({
  userId,
  accountId,
  transactionIds,
}: {
  userId: number;
  accountId: number;
  transactionIds: number[];
}) => {
  if (transactionIds.length > 0) {
    const payload: TransactionsSyncedPayload = {
      userId,
      accountId,
      transactionIds,
    };
    eventBus.emit(DOMAIN_EVENTS.TRANSACTIONS_SYNCED, payload);

    logger.info(`Emitted ${DOMAIN_EVENTS.TRANSACTIONS_SYNCED} event with ${transactionIds.length} transactions`);
  }
};
