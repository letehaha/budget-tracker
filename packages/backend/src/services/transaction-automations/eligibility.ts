import { ACCOUNT_TYPES, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { Op, literal } from 'sequelize';

export const isAutomationEligible = ({
  accountType,
  externalData,
  transferNature,
  isPlanned,
}: {
  accountType: ACCOUNT_TYPES;
  externalData: Record<string, unknown> | null | undefined;
  transferNature: TRANSACTION_TRANSFER_NATURE;
  isPlanned: boolean;
}): boolean =>
  (accountType !== ACCOUNT_TYPES.system || Boolean(externalData && 'importDetails' in externalData)) &&
  transferNature === TRANSACTION_TRANSFER_NATURE.not_transfer &&
  !isPlanned;

/**
 * SQL twin of the account-type half of `isAutomationEligible` for the preview scan (the
 * transfer/planned halves are `findTransactions` policy). Keyed on the account row, not
 * `Transactions.accountType`: unlinking rewrites that column to `system` and relinking leaves it.
 */
export const buildEligibilityWhere = ({ bankAccountIds }: { bankAccountIds: string[] }) => ({
  [Op.or]: [
    { accountId: { [Op.in]: bankAccountIds } },
    literal(`"Transactions"."externalData"->'importDetails' IS NOT NULL`),
  ],
});
