import type { RecordId } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import TransactionTemplates from '@models/transaction-templates.model';
import { withTransaction } from '@services/common/with-transaction';

export const deleteTransactionTemplate = withTransaction(async ({ id, userId }: { id: RecordId; userId: number }) => {
  const template = await findOrThrowNotFound({
    query: TransactionTemplates.findOne({ where: { id, userId } }),
    message: t({ key: 'transactionTemplates.notFound' }),
  });

  await template.destroy();

  return { success: true };
});
