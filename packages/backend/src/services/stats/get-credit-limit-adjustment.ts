import Accounts from '@models/Accounts.model';
import { Op } from 'sequelize';

/**
 * Calculates the total credit limit in base currency (cents) for all accounts
 * that have a credit limit and are not excluded from stats.
 *
 * Used to adjust balance calculations when the user enables the
 * "include credit limit in stats" setting.
 */
export const getCreditLimitAdjustment = async ({ userId }: { userId: number }): Promise<number> => {
  const accounts = await Accounts.findAll({
    where: {
      userId,
      excludeFromStats: false,
      creditLimit: { [Op.gt]: 0 },
    },
    attributes: ['refCreditLimit'],
  });

  return accounts.reduce((sum, account) => sum + account.refCreditLimit.toCents(), 0);
};
