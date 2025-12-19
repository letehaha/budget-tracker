import { Op } from 'sequelize';
import { Model, Column, DataType, ForeignKey, BelongsTo, Table } from 'sequelize-typescript';
import { TRANSACTION_TYPES, BalanceModel, ACCOUNT_TYPES } from '@bt/shared/types';
import { subDays, startOfMonth, startOfDay } from 'date-fns';
import Accounts from './Accounts.model';
import Transactions, { TransactionsAttributes } from './Transactions.model';
import { getExchangeRate } from '@services/user-exchange-rate/get-exchange-rate.service';
import { logger } from '@js/utils';
import { roundHalfToEven } from '@common/utils/round-half-to-even';
// import type { AmountType } from '@root/services/bank-data-providers/enablebanking';
// import { toSystemAmount } from '@js/helpers/system-amount';

interface GetTotalBalanceHistoryPayload {
  startDate: Date;
  endDate: Date;
  accountIds: number[];
}

@Table({ timestamps: true, tableName: 'Balances', freezeTableName: true })
export default class Balances extends Model {
  @Column({
    allowNull: false,
    primaryKey: true,
    autoIncrement: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @Column({
    allowNull: false,
    type: DataType.DATEONLY,
  })
  date!: Date;

  @Column({
    allowNull: false,
    type: DataType.INTEGER,
  })
  /**
   * Representation of the account balance at the specific date. Each time a new
   * transaction is being added, changed or removed, we update account balance,
   * and also this `amount` field, so that we always have actual balance for the
   * specific date.
   * `amount` is in the BASE currency. So it represents a `refAmount` (`refBalance`)
   */
  amount!: number;

  @ForeignKey(() => Accounts)
  @Column({ allowNull: false, type: DataType.INTEGER, })
  accountId!: number;

  @BelongsTo(() => Accounts)
  account!: Accounts;

  // Method to calculate the total balance across all accounts
  static async getTotalBalance({ userId }: { userId: number }): Promise<number> {
    const userAccounts = await Accounts.findAll({ where: { userId: userId } });
    const accountIds = userAccounts.map((account) => account.id);

    const result = await Balances.sum('amount', {
      where: { accountId: accountIds },
    });

    return result || 0;
  }

  // Method to retrieve total balance history for specified dates and accounts
  static async getTotalBalanceHistory(payload: GetTotalBalanceHistoryPayload): Promise<BalanceModel[]> {
    const { startDate, endDate, accountIds } = payload;
    return Balances.findAll({
      where: {
        date: {
          [Op.between]: [startDate, endDate],
        },
        accountId: accountIds,
      },
      order: [['date', 'ASC']],
      include: [Accounts],
    });
  }

  // Transactions might have positive and negative amount
  // ### Transaction creation
  // 1. ✅ If just a new tx is created. Create a new record with date and (amount + refAmount) of tx
  // 2. ✅ If new tx is created, but there's already record for that date, then just update the record's amount
  // 3. ✅ If new tx is created, but there's no record before that day, then create one
  //      more record to represent accounts' initialBalance and record for the transaction itself

  // ### Transaction updation
  // 1. ✅ If tx amount, data, accountId, or transactionType is updated, update balances correspondingly

  // ### Transaction deletion
  // 1. ✅ If tx is deleted, update balances for all records correspondingly

  // ### Account creation
  // 1. ✅ Add a new record to Balances table with a `currentBalance` that is specified in Accounts table

  // ### Account deletion will be handled by `cascade` deletion
  static async handleTransactionChange({
    data,
    prevData,
    isDelete = false,
  }: {
    data: Transactions;
    prevData?: Transactions;
    isDelete?: boolean;
  }) {
    const { accountId, time } = data;
    let amount = data.transactionType === TRANSACTION_TYPES.income ? data.refAmount : data.refAmount * -1;
    const date = startOfDay(new Date(time));

    switch (data.accountType) {
      case ACCOUNT_TYPES.system: {
        if (isDelete) {
          amount = -amount; // Reverse the amount if it's a deletion
        } else if (prevData) {
          const originalDate = startOfDay(new Date(prevData.time));
          const originalAmount =
            prevData.transactionType === TRANSACTION_TYPES.income ? prevData.refAmount : prevData.refAmount * -1;

          if (
            // If the account ID changed,
            accountId !== prevData.accountId ||
            // the date changed,
            +date !== +originalDate ||
            // the transaction type changed,
            data.transactionType !== prevData.transactionType ||
            // or the amount changed
            amount
            // THEN remove the original transaction
          ) {
            await this.updateBalanceIncremental({
              accountId: prevData.accountId,
              date: originalDate,
              amount: -originalAmount,
            });
          }
        }

        // Update the balance for the current account and date
        await this.updateBalanceIncremental({
          accountId,
          date,
          amount,
        });
        break;
      }

      case ACCOUNT_TYPES.monobank: {
        // Monobank provides the actual account balance after each transaction.
        // Transactions are sorted by time before processing, so the last transaction
        // for each day will set the correct end-of-day balance.
        //
        // Balance is in account's currency (e.g., UAH), but Balances.amount must be
        // stored in BASE currency (refBalance). We use the exchange rate service to
        // get consistent market rates.
        // TODO: we probably need to avoid updating opposite_tx refAmount based on
        // original-tx refAmount
        const balance = (data.externalData as TransactionsAttributes['externalData']).balance;

        if (balance !== undefined) {
          const exchangeRateData = await getExchangeRate({
            userId: data.userId,
            date,
            baseCode: data.currencyCode,
            quoteCode: data.refCurrencyCode,
          });
          const refBalance = roundHalfToEven(balance * exchangeRateData.rate);

          await this.updateAccountBalance({ accountId, date, refBalance });
        }
        break;
      }

      case ACCOUNT_TYPES.enableBanking: {
      //   // EnableBanking transactions are sorted by booking_date before processing,
      //   // so the last transaction processed for each day will have the correct end-of-day balance.
      //   // After all transactions are synced, Balances.updateAccountBalance() is called
      //   // with the authoritative balance from the bank's API to ensure accuracy.
      //   //
      //   // balance_after_transaction is optional in the EnableBanking API - not all banks provide it.
      //   // When available, we use it to build historical balance data for smooth trend indicators.
      //   const externalData = data.externalData as { balanceAfter?: AmountType } | undefined;
      //   const balanceAfter = externalData?.balanceAfter;

      //   if (balanceAfter) {
      //     const balanceAmount = toSystemAmount(parseFloat(balanceAfter.amount));
      //     const exchangeRateData = await getExchangeRate({
      //       userId: data.userId,
      //       date,
      //       baseCode: data.currencyCode,
      //       quoteCode: data.refCurrencyCode,
      //     });
      //     const refBalance = roundHalfToEven(balanceAmount * exchangeRateData.rate);

      //     await this.updateAccountBalance({ accountId, date, refBalance });
      //   }
      //   // If no balanceAfter, skip - balance will be set by updateAccountBalance() after sync
        break;
      }

      default: {
        const exhaustiveCheck: never = data.accountType;

        if (process.env.NODE_ENV === "development") {
          throw new Error(`Unhandled account type in handleTransactionChange: ${exhaustiveCheck}`);
        } else {
          logger.error(`Unhandled account type in handleTransactionChange: ${exhaustiveCheck}`)
        }
        console.log('default');
      }
    }
  }

  /**
   * Update balance for system accounts using INCREMENTAL amount changes.
   *
   * This method is specifically for ACCOUNT_TYPES.system where transactions
   * incrementally affect balance. It differs from updateAccountBalance() which
   * sets an absolute value.
   *
   * Key behaviors:
   * - Takes an incremental `amount` (positive for income, negative for expense)
   * - Adds the amount to the existing balance (not replaces it)
   * - Cascades changes to all future dates (updates all records after this date)
   * - Creates first-of-month records for easier period calculations
   *
   * For external bank providers (Monobank, EnableBanking), use updateAccountBalance()
   * which sets an absolute balance value without cascading.
   */
  private static async updateBalanceIncremental({ accountId, date, amount }: { accountId: number; date: Date; amount: number }) {
    // If there's no record for the 1st of the month, create it based on the closest record prior it
    // so it's easier to calculate stats for the period
    const firstDayOfMonth = startOfMonth(new Date(date));
    let firstDayBalance = await this.findOne({
      where: {
        accountId,
        date: firstDayOfMonth,
      },
    });

    if (!firstDayBalance) {
      const latestBalancePrior = await this.findOne({
        where: {
          date: {
            [Op.lt]: firstDayOfMonth,
          },
          accountId,
        },
        attributes: ['amount'],
        order: [['date', 'DESC']],
      });

      if (latestBalancePrior) {
        // Create a record for the 1st day of the month
        firstDayBalance = await this.create({
          accountId,
          date: firstDayOfMonth,
          amount: latestBalancePrior.amount,
        });
      }
    }

    // Try to find an existing balance for the account and date
    let balanceForTxDate = await this.findOne({
      where: {
        accountId,
        date,
      },
    });

    // If history record has previous amount, it means it's updating,
    // so we need to set newAmount - oldAmount
    if (!balanceForTxDate) {
      // If there's not balance for current tx data, we trying to find a balance
      // prior tx date
      const latestBalancePrior = await this.findOne({
        where: {
          date: {
            [Op.lt]: date,
          },
          accountId,
        },
        order: [['date', 'DESC']],
      });

      // If there's no balance prior tx date, it means that we're adding
      // the youngest transaction, aka the 1st one, so we need to check a balance
      // that comes prior it
      if (!latestBalancePrior) {
        // Example of how this logic should work like
        // Initially we had 100 at 10-10-23
        // Then we added 10 at 11-10-23, so 11-10-23 is now 100 + 10 = 110
        // Then we wanna add -10 at 9-10-23, so that we need to:
        // 1. Create a record for 8-10-23, with amount of 100 (so it will represent the initialBalance of account)
        // 2. Then create a record for 9-10-23 (our tx date), we correct amount
        // 3. Then update all future amounts
        const account = await Accounts.findOne({
          where: { id: accountId },
        });

        // if (account) {
        // (1) Firstly we now need to create one more record that will represent the
        // balance before that transaction
        await this.create({
          accountId,
          date: subDays(new Date(date), 1),
          amount: account!.refInitialBalance,
        });

        // (2) Then we create a record for that transaction
        await this.create({
          accountId,
          date,
          amount: account!.refInitialBalance + amount,
        });
        // }
      } else {
        // And then create a new record with the amount + latestBalance
        balanceForTxDate = await this.create({
          accountId,
          date,
          amount: latestBalancePrior.amount + amount,
        });
      }
    } else {
      // If a balance already exists, update its amount
      balanceForTxDate.amount += amount;

      await balanceForTxDate.save();
    }

    // if (Balances.sequelize) {
    // Update the amount of all balances for the account that come after the date
    await this.update(
      { amount: Balances.sequelize!.literal(`amount + ${amount}`) },
      {
        where: {
          accountId,
          date: {
            [Op.gt]: date,
          },
        },
      },
    );
    // }
  }

  /**
   * Handles balance records when an account is created or its initial balance is updated.
   *
   * - **Account creation**: Creates the first balance record for today with the account's
   *   initial balance (refInitialBalance).
   * - **Initial balance update**: Adjusts all existing balance records by the difference
   *   between old and new initial balance, maintaining correct historical balances.
   *
   * @param account - The account being created or updated
   * @param prevAccount - The previous account state (undefined for new accounts)
   */
  static async handleAccountChange({ account, prevAccount }: { account: Accounts; prevAccount?: Accounts }) {
    const { id: accountId, refInitialBalance } = account;

    // Try to find an existing balance for the account
    const record = await this.findOne({
      where: {
        accountId,
      },
    });

    // If record exists, then it's account updating, otherwise account creation
    if (record && prevAccount) {
      const diff = refInitialBalance - prevAccount.refInitialBalance;

      // if (Balances.sequelize) {
      // Update history for all the records realted to that account
      await this.update(
        { amount: Balances.sequelize!.literal(`amount + ${diff}`) },
        {
          where: { accountId },
        },
      );
      // }
    } else {
      const date = startOfDay(new Date());

      // If no balance exists yet, create one with the account's current balance
      await this.create({
        accountId,
        date,
        amount: refInitialBalance,
      });
    }
  }

  /**
   * Update account balance with an absolute value (not incremental).
   * Used by external bank providers (e.g., Monobank, EnableBanking) to set balance
   * based on transaction's balance_after or the authoritative balance from bank's API.
   *
   * Transactions should be sorted by time before processing so the last transaction
   * for each day sets the correct end-of-day balance.
   *
   * @param accountId - The account to update
   * @param date - The date for the balance record
   * @param refBalance - The balance amount in base currency
   */
  static async updateAccountBalance({
    accountId,
    date,
    refBalance,
  }: {
    accountId: number;
    date: Date;
    refBalance: number;
  }) {
    const normalizedDate = startOfDay(date);

    const existingRecord = await this.findOne({
      where: {
        accountId,
        date: normalizedDate,
      },
    });

    if (existingRecord) {
      existingRecord.amount = refBalance;
      await existingRecord.save();
    } else {
      await this.create({
        accountId,
        date: normalizedDate,
        amount: refBalance,
      });
    }
  }
}
