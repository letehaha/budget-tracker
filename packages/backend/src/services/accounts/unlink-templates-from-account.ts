import TransactionTemplates from '@models/transaction-templates.model';

/**
 * Clears `amount` together with `accountId`: a pinned amount has no currency without an
 * account.
 */
export const unlinkTemplatesFromAccount = async ({ accountId }: { accountId: string }) => {
  await TransactionTemplates.update({ accountId: null, amount: null }, { where: { accountId } });
};
