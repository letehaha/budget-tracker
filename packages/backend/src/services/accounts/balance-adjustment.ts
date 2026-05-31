import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import Accounts from '@models/accounts.model';
import type Transactions from '@models/transactions.model';
import { getUserDefaultCategory } from '@models/users.model';
import Vehicles from '@models/vehicles.model';
import { withTransaction } from '@services/common/with-transaction';
import { createTransaction } from '@services/transactions/create-transaction';
import { refreshVehicleValueIfStale } from '@services/vehicles/refresh-vehicle-value.service';
import { format } from 'date-fns';

interface AdjustAccountBalanceParams {
  userId: number;
  accountId: string;
  targetBalance: Money;
  note?: string;
  /** Effective date of the adjustment. Defaults to now when omitted — pass a past date to backdate. */
  time?: Date;
  /**
   * Vehicle accounts may only have their value changed through the dedicated
   * override endpoint (`POST /vehicles/:id/value` → `overrideVehicleValue`),
   * which sets this to `true`. Every other caller (the public
   * `POST /accounts/:id/balance-adjustment` controller) leaves it falsy, so a
   * vehicle account is rejected below — there is exactly one sanctioned path to
   * a vehicle's value, keeping `Vehicle.valueAnchor` authoritative.
   */
  allowVehicle?: boolean;
}

interface AdjustAccountBalanceResult {
  transaction: Transactions | null;
  previousBalance: Money;
  newBalance: Money;
}

export const adjustAccountBalance = withTransaction(
  async ({
    userId,
    accountId,
    targetBalance,
    note,
    time,
    allowVehicle,
  }: AdjustAccountBalanceParams): Promise<AdjustAccountBalanceResult> => {
    const account = await Accounts.findByPk(accountId);

    if (!account || account.userId !== userId) {
      throw new NotFoundError({
        message: t({ key: 'balanceAdjustment.accountNotFound', variables: { accountId } }),
      });
    }

    // A vehicle's value is owned by the depreciation model + override flow. The
    // generic balance-adjustment path leaves `allowVehicle` falsy, so reject it
    // here and point the caller at the override endpoint — only that path keeps
    // `Vehicle.valueAnchor` in sync.
    if (account.accountCategory === ACCOUNT_CATEGORIES.vehicle && !allowVehicle) {
      throw new ValidationError({
        message: t({ key: 'balanceAdjustment.vehicleUseOverride' }),
      });
    }

    const previousBalance = account.currentBalance;
    const diff = targetBalance.subtract(previousBalance);

    if (diff.isZero()) {
      return {
        transaction: null,
        previousBalance,
        newBalance: previousBalance,
      };
    }

    const effectiveTime = time ?? new Date();
    const transactionType = diff.isPositive() ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense;

    const defaultCategoryId = await getUserDefaultCategory({ id: userId });

    const [transaction] = await createTransaction({
      userId,
      accountId,
      amount: diff.abs(),
      transactionType,
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      accountType: ACCOUNT_TYPES.system,
      paymentType: PAYMENT_TYPES.bankTransfer,
      note: note ?? t({ key: 'balanceAdjustment.defaultNote' }),
      categoryId: defaultCategoryId,
      time: effectiveTime,
    });

    // Vehicles aren't real accounts in the usual sense — they're an asset whose
    // value drifts down a depreciation curve. When a user manually adjusts the
    // balance, that IS an override of the model's projection, so we re-anchor
    // the depreciation curve to (targetBalance, effectiveTime). Without this,
    // the next stale-cache refresh would recompute from the original purchase
    // and silently overwrite the user's adjustment.
    let newBalance = targetBalance;
    if (account.accountCategory === ACCOUNT_CATEGORIES.vehicle) {
      const vehicle = await Vehicles.findOne({ where: { accountId } });
      if (vehicle) {
        await vehicle.update({
          valueAnchor: targetBalance,
          valueAnchorDate: format(effectiveTime, 'yyyy-MM-dd'),
          // Null out the cache so the refresh below recomputes from the new
          // (anchor, anchorDate) instead of returning a stale cached balance.
          valueLastComputedAt: null,
        });

        // If the override is backdated, today's depreciated value is BELOW the
        // target the user typed (which was the value at `effectiveTime`).
        // Force-refresh so Account.currentBalance reflects the depreciated
        // value as of now — otherwise the page header reads stale.
        const refreshed = await refreshVehicleValueIfStale({
          vehicleId: vehicle.id,
          force: true,
        });
        newBalance = refreshed.value;
      }
    }

    return {
      transaction: transaction ?? null,
      previousBalance,
      newBalance,
    };
  },
);
