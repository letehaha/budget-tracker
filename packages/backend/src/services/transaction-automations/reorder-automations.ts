import type { RecordId } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ConflictError } from '@js/errors';
import TransactionAutomations from '@models/transaction-automations.model';
import { withTransaction } from '@services/common/with-transaction';

import { listAutomations } from './list-automations';

/**
 * `ids` must be the user's full id set — a stale list (another tab created or
 * deleted a rule) is a 409 the client resolves by refetching.
 */
export const reorderAutomations = withTransaction(async ({ userId, ids }: { userId: number; ids: RecordId[] }) => {
  const automations = await TransactionAutomations.findAll({ where: { userId } });
  const byId = new Map(automations.map((automation) => [automation.id, automation]));

  if (ids.length !== byId.size || ids.some((id) => !byId.has(id))) {
    throw new ConflictError({ message: t({ key: 'automations.reorderStale' }) });
  }

  for (const [index, id] of ids.entries()) {
    const automation = byId.get(id)!;
    if (automation.position !== index) await automation.update({ position: index });
  }

  return listAutomations({ userId });
});
