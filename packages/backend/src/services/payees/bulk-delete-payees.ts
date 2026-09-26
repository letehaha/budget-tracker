import { t } from '@i18n/index';
import { NotFoundError } from '@js/errors';
import PayeeAliases from '@models/payee-aliases.model';
import Payees from '@models/payees.model';
import TransactionAutomations from '@models/transaction-automations.model';
import { collectAutomationRefs, pauseAutomationsReferencing } from '@services/transaction-automations/references';

import { withTransaction } from '../common/with-transaction';
import { ignorePayeeNames } from './ignored-names.service';

interface BulkDeletePayeesParams {
  userId: number;
  ids: string[];
  ignoreFuture: boolean;
}

/**
 * All-or-nothing: an unknown or foreign id throws NotFound and rolls back every
 * delete in the batch.
 */
export const bulkDeletePayees = withTransaction(
  async ({
    userId,
    ids,
    ignoreFuture,
  }: BulkDeletePayeesParams): Promise<{ deletedCount: number; ignoredAddedCount: number }> => {
    const payees = await Payees.findAll({
      where: { userId, id: ids },
      include: [{ model: PayeeAliases, as: 'aliases' }],
    });
    if (payees.length !== ids.length) {
      throw new NotFoundError({ message: t({ key: 'payees.notFound' }) });
    }

    const automations = await TransactionAutomations.findAll({ where: { userId } });
    const referencedPayeeIds = new Set(
      automations
        .flatMap((automation) => collectAutomationRefs(automation))
        .filter((ref) => ref.refType === 'payee')
        .map((ref) => ref.refId as string),
    );
    for (const payee of payees) {
      if (referencedPayeeIds.has(payee.id)) {
        await pauseAutomationsReferencing({ userId, refType: 'payee', refId: payee.id, label: payee.name });
      }
    }

    const { addedCount } = ignoreFuture ? await ignorePayeeNames({ userId, payees }) : { addedCount: 0 };

    // FK `SET NULL` on `Transactions.payeeId` unlinks transactions; aliases cascade-delete.
    await Payees.destroy({ where: { userId, id: ids } });

    return { deletedCount: payees.length, ignoredAddedCount: addedCount };
  },
);
