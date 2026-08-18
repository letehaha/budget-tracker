import { autoLinkTransfers } from './auto-link-transfers';
import { emitTransactionsSyncEvent } from './emit-transactions-sync-event';

export async function linkAndEmitSyncedTransactions({
  userId,
  accountId,
  transactionIds,
  extraAutoLinkCandidateIds,
}: {
  userId: number;
  accountId: string;
  transactionIds: string[];
  extraAutoLinkCandidateIds?: string[];
}): Promise<void> {
  const autoLinkedIds = await autoLinkTransfers({
    userId,
    transactionIds: [...transactionIds, ...(extraAutoLinkCandidateIds ?? [])],
  });

  emitTransactionsSyncEvent({
    userId,
    accountId,
    transactionIds: transactionIds.filter((id) => !autoLinkedIds.has(id)),
  });
}
