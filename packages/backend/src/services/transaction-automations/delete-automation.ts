import type { RecordId } from '@bt/shared/types';
import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import { t } from '@i18n/index';
import TransactionAutomations from '@models/transaction-automations.model';
import { withTransaction } from '@services/common/with-transaction';

export const deleteAutomation = withTransaction(async ({ userId, id }: { userId: number; id: RecordId }) => {
  const automation = await findOrThrowNotFound({
    query: TransactionAutomations.findOne({ where: { id, userId } }),
    message: t({ key: 'automations.automationNotFound' }),
  });

  await automation.destroy();
});
