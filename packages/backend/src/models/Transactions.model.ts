import {
  ACCOUNT_TYPES,
  PAYMENT_TYPES,
  TRANSACTION_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  SORT_DIRECTIONS,
  TransactionModel,
} from '@bt/shared/types';
import { Op, Includeable, WhereOptions } from 'sequelize';
import {
  Table,
  BeforeCreate,
  AfterCreate,
  AfterUpdate,
  BeforeDestroy,
  BeforeUpdate,
  Column,
  Model,
  Length,
  ForeignKey,
  DataType,
  BelongsTo,
} from 'sequelize-typescript';
import { isExist, removeUndefinedKeys } from '@js/helpers';
import { ValidationError } from '@js/errors';
import { updateAccountBalanceForChangedTx } from '@services/accounts.service';
import Users from '@models/Users.model';
import Accounts from '@models/Accounts.model';
import Categories from '@models/Categories.model';
import Currencies from '@models/Currencies.model';
import Balances from '@models/Balances.model';

// TODO: replace with scopes
const prepareTXInclude = ({
  includeUser,
  includeAccount,
  includeCategory,
  includeAll,
  nestedInclude,
}: {
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
}) => {
  let include: Includeable | Includeable[] | null = null;

  if (isExist(includeAll)) {
    include = { all: true, nested: isExist(nestedInclude) || undefined };
  } else {
    include = [];

    if (isExist(includeUser)) include.push({ model: Users });
    if (isExist(includeAccount)) include.push({ model: Accounts });
    if (isExist(includeCategory)) include.push({ model: Categories });
  }

  return include;
};

export interface TransactionsAttributes {
  id: number;
  amount: number;
  // Amount in currency of base currency
  refAmount: number;
  note: string;
  time: Date;
  userId: number;
  transactionType: TRANSACTION_TYPES;
  paymentType: PAYMENT_TYPES;
  accountId: number;
  categoryId: number;
  currencyId: number;
  currencyCode: string;
  accountType: ACCOUNT_TYPES;
  refCurrencyCode: string;

  // is transaction transfer?
  transferNature: TRANSACTION_TRANSFER_NATURE;
  // (hash, used to connect two transactions, to easily search the opposite tx)
  transferId: string;

  originalId: string; // Stores the original id from external source
  // JSON of any addition fields
  externalData: {
    operationAmount?: number;
    balance?: number;
    hold?: boolean;
    receiptId?: string;
  };
  commissionRate: number; // should be comission calculated as refAmount
  refCommissionRate: number; // should be comission calculated as refAmount
  cashbackAmount: number; // add to unified
  refundLinked: boolean;
}

@Table({
  timestamps: false,
})
export default class Transactions extends Model {
  @Column({
    unique: true,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    type: DataType.INTEGER,
  })
  declare id: number;

  @Column({ allowNull: false, defaultValue: 0, type: DataType.NUMBER })
  amount!: number;

  // Amount in curreny of account
  @Column({ allowNull: false, defaultValue: 0, type: DataType.NUMBER })
  refAmount!: number;

  @Length({ max: 2000 })
  @Column({ allowNull: true, type: DataType.STRING })
  note!: string;

  @Column({
    defaultValue: Date.now(),
    allowNull: false,
    type: DataType.DATE,
  })
  time!: Date;

  @ForeignKey(() => Users)
  @Column({ type: DataType.INTEGER })
  userId!: number;

  @Column({ allowNull: false, defaultValue: TRANSACTION_TYPES.income, type: DataType.ENUM(...Object.values(TRANSACTION_TYPES)), })
  transactionType!: TRANSACTION_TYPES;

  @Column({ allowNull: false, defaultValue: PAYMENT_TYPES.creditCard, type: DataType.ENUM(...Object.values(PAYMENT_TYPES)), })
  paymentType!: PAYMENT_TYPES;

  @ForeignKey(() => Accounts)
  @Column({ allowNull: false, type: DataType.INTEGER })
  accountId!: number;

  @BelongsTo(() => Accounts)
  account!: Accounts;

  @ForeignKey(() => Categories)
  @Column({ allowNull: false, type: DataType.INTEGER })
  categoryId!: number;

  @ForeignKey(() => Currencies)
  @Column({ allowNull: false, type: DataType.INTEGER })
  currencyId!: number;

  @Column({ allowNull: false, type: DataType.STRING })
  currencyCode!: string;

  @Column({ allowNull: false, defaultValue: ACCOUNT_TYPES.system, type: DataType.ENUM(...Object.values(ACCOUNT_TYPES)), })
  accountType!: ACCOUNT_TYPES;

  @Column({ allowNull: true, defaultValue: null, type: DataType.STRING })
  refCurrencyCode!: string;

  @Column({
    type: DataType.ENUM(...Object.values(TRANSACTION_TRANSFER_NATURE)),
    allowNull: false,
    defaultValue: TRANSACTION_TRANSFER_NATURE.not_transfer,
  })
  transferNature!: TRANSACTION_TRANSFER_NATURE;

  // (hash, used to connect two transactions)
  @Column({ allowNull: true, defaultValue: null, type: DataType.INTEGER })
  transferId!: string;

  // Stores the original id from external source
  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  originalId!: string;

  // Stores the original id from external source
  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  externalData!: object;

  // Stores the original id from external source
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  commissionRate!: number;

  // Stores the original id from external source
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  refCommissionRate!: number;

  // Stores the original id from external source
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  cashbackAmount!: number;

  // Represents if the transaction refunds another tx, or is being refunded by other. Added only for
  // optimization purposes. All the related refund information is tored in the "RefundTransactions"
  // table
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  refundLinked!: boolean;

  // User should set all of requiredFields for transfer transaction
  @BeforeCreate
  @BeforeUpdate
  static validateTransferRelatedFields(instance: Transactions) {
    const { transferNature, transferId, refAmount, refCurrencyCode } = instance;

    const requiredFields = [transferId, refCurrencyCode, refAmount];

    if (transferNature === TRANSACTION_TRANSFER_NATURE.common_transfer) {
      if (requiredFields.some((item) => item === undefined)) {
        throw new ValidationError({
          message: `All these fields should be passed (${requiredFields}) for transfer transaction.`,
        });
      }
    }
  }

  @AfterCreate
  static async updateAccountBalanceAfterCreate(instance: Transactions) {
    const { accountType, accountId, userId, currencyId, refAmount, amount, transactionType } = instance;

    if (accountType === ACCOUNT_TYPES.system) {
      await updateAccountBalanceForChangedTx({
        userId,
        accountId,
        amount,
        refAmount,
        transactionType,
        currencyId,
      });
    }

    await Balances.handleTransactionChange({ data: instance });
  }

  @AfterUpdate
  static async updateAccountBalanceAfterUpdate(instance: Transactions) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newData: Transactions = (instance as any).dataValues;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevData: Transactions = (instance as any)._previousDataValues;
    const isAccountChanged = newData.accountId !== prevData.accountId;

    if (newData.accountType === ACCOUNT_TYPES.system) {
      if (isAccountChanged) {
        // Update old tx
        await updateAccountBalanceForChangedTx({
          userId: prevData.userId,
          accountId: prevData.accountId,
          prevAmount: prevData.amount,
          prevRefAmount: prevData.refAmount,
          transactionType: prevData.transactionType,
          currencyId: prevData.currencyId,
        });

        // Update new tx
        await updateAccountBalanceForChangedTx({
          userId: newData.userId,
          accountId: newData.accountId,
          amount: newData.amount,
          refAmount: newData.refAmount,
          transactionType: newData.transactionType,
          currencyId: newData.currencyId,
        });
      } else {
        await updateAccountBalanceForChangedTx({
          userId: newData.userId,
          accountId: newData.accountId,
          amount: newData.amount,
          prevAmount: prevData.amount,
          refAmount: newData.refAmount,
          prevRefAmount: prevData.refAmount,
          transactionType: newData.transactionType,
          prevTransactionType: prevData.transactionType,
          currencyId: newData.currencyId,
        });
      }
    }

    const originalData = {
      accountId: prevData.accountId,
      amount: prevData.amount,
      refAmount: prevData.refAmount,
      time: prevData.time,
      transactionType: prevData.transactionType,
      currencyId: prevData.currencyId,
    } as Transactions;

    await Balances.handleTransactionChange({
      data: newData,
      prevData: originalData,
    });
  }

  @BeforeDestroy
  static async updateAccountBalanceBeforeDestroy(instance: Transactions) {
    const { accountType, accountId, userId, currencyId, refAmount, amount, transactionType } = instance;

    if (accountType === ACCOUNT_TYPES.system) {
      await updateAccountBalanceForChangedTx({
        userId,
        accountId,
        prevAmount: amount,
        prevRefAmount: refAmount,
        transactionType,
        currencyId,
      });
    }

    await Balances.handleTransactionChange({ data: instance, isDelete: true });
  }
}

export const findWithFilters = async ({
  from = 0,
  limit = 20,
  accountType,
  accountIds,
  userId,
  order = SORT_DIRECTIONS.desc,
  includeUser,
  includeAccount,
  transactionType,
  includeCategory,
  includeAll,
  nestedInclude,
  isRaw = false,
  excludeTransfer,
  excludeRefunds,
  startDate,
  endDate,
  amountGte,
  amountLte,
}: {
  from: number;
  limit?: number;
  accountType?: ACCOUNT_TYPES;
  transactionType?: TRANSACTION_TYPES;
  accountIds?: number[];
  userId: number;
  order?: SORT_DIRECTIONS;
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
  isRaw: boolean;
  excludeTransfer?: boolean;
  excludeRefunds?: boolean;
  startDate?: string;
  endDate?: string;
  amountGte?: number;
  amountLte?: number;
}) => {
  const include = prepareTXInclude({
    includeUser,
    includeAccount,
    includeCategory,
    includeAll,
    nestedInclude,
  });

  const whereClause: WhereOptions<Transactions> = {
    userId,
    ...removeUndefinedKeys({
      accountType,
      transactionType,
      transferNature: excludeTransfer ? TRANSACTION_TRANSFER_NATURE.not_transfer : undefined,
      refundLinked: excludeRefunds ? false : undefined,
    }),
  };

  if (accountIds && accountIds.length > 0) {
    whereClause.accountId = {
      [Op.in]: accountIds,
    };
  }

  if (startDate || endDate) {
    whereClause.time = {};
    if (startDate && endDate) {
      whereClause.time = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    } else if (startDate) {
      whereClause.time[Op.gte] = new Date(startDate);
    } else if (endDate) {
      whereClause.time[Op.lte] = new Date(endDate);
    }
  }

  if (amountGte || amountLte) {
    whereClause.amount = {};
    if (amountGte && amountLte) {
      whereClause.amount = {
        [Op.between]: [amountGte, amountLte],
      };
    } else if (amountGte) {
      whereClause.amount[Op.gte] = amountGte;
    } else if (amountLte) {
      whereClause.amount[Op.lte] = amountLte;
    }
  }

  const transactions = await Transactions.findAll({
    include,
    where: whereClause,
    offset: from,
    limit: limit,
    order: [['time', order]],
    raw: isRaw,
  });

  return transactions;
};

export interface GetTransactionBySomeIdPayload {
  userId: TransactionsAttributes['userId'];
  id?: TransactionsAttributes['id'];
  transferId?: TransactionsAttributes['transferId'];
  originalId?: TransactionsAttributes['originalId'];
}
export const getTransactionBySomeId = ({ userId, id, transferId, originalId }: GetTransactionBySomeIdPayload) => {
  return Transactions.findOne({
    where: {
      userId,
      ...removeUndefinedKeys({ id, transferId, originalId }),
    },
  });
};

export const getTransactionById = ({
  id,
  userId,
  includeUser,
  includeAccount,
  includeCategory,
  includeAll,
  nestedInclude,
}: {
  id: number;
  userId: number;
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
}): Promise<Transactions | null> => {
  const include = prepareTXInclude({
    includeUser,
    includeAccount,
    includeCategory,
    includeAll,
    nestedInclude,
  });

  return Transactions.findOne({
    where: { id, userId },
    include,
  });
};

export const getTransactionsByTransferId = ({
  transferId,
  userId,
  includeUser,
  includeAccount,
  includeCategory,
  includeAll,
  nestedInclude,
}: {
  transferId: number;
  userId: number;
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
}) => {
  const include = prepareTXInclude({
    includeUser,
    includeAccount,
    includeCategory,
    includeAll,
    nestedInclude,
  });

  return Transactions.findAll({
    where: { transferId, userId },
    include,
  });
};

export const getTransactionsByArrayOfField = async <T extends keyof TransactionModel>({
  fieldValues,
  fieldName,
  userId,
  includeUser,
  includeAccount,
  includeCategory,
  includeAll,
  nestedInclude,
}: {
  fieldValues: TransactionModel[T][];
  fieldName: T;
  userId: number;
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
}) => {
  const include = prepareTXInclude({
    includeUser,
    includeAccount,
    includeCategory,
    includeAll,
    nestedInclude,
  });

  const transactions = await Transactions.findAll({
    where: {
      [fieldName]: {
        [Op.in]: fieldValues,
      },
      userId,
    },
    include,
  });

  return transactions;
};

type CreateTxRequiredParams = Pick<
  TransactionsAttributes,
  | 'amount'
  | 'refAmount'
  | 'userId'
  | 'transactionType'
  | 'paymentType'
  | 'accountId'
  | 'currencyId'
  | 'currencyCode'
  | 'accountType'
  | 'transferNature'
>;
type CreateTxOptionalParams = Partial<
  Pick<
    TransactionsAttributes,
    | 'note'
    | 'time'
    | 'categoryId'
    | 'refCurrencyCode'
    | 'transferId'
    | 'originalId'
    | 'externalData'
    | 'commissionRate'
    | 'refCommissionRate'
    | 'cashbackAmount'
  >
>;

export type CreateTransactionPayload = CreateTxRequiredParams & CreateTxOptionalParams;

export const createTransaction = async ({ userId, ...rest }: CreateTransactionPayload) => {
  const response = await Transactions.create({ userId, ...rest });

  return getTransactionById({
    id: response.get('id'),
    userId,
  });
};

export interface UpdateTransactionByIdParams {
  id: number;
  userId: number;
  amount?: number;
  refAmount?: number;
  note?: string | null;
  time?: Date;
  transactionType?: TRANSACTION_TYPES;
  paymentType?: PAYMENT_TYPES;
  accountId?: number;
  categoryId?: number;
  currencyId?: number;
  currencyCode?: string;
  refCurrencyCode?: string;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
  transferId?: string | null;
  refundLinked?: boolean;
}

export const updateTransactionById = async (
  { id, userId, ...payload }: UpdateTransactionByIdParams,
  {
    // For refunds we need to have an option to disable them. Otherwise there will be some kind of
    // deadlock - request stucks forever with no error message. TODO: consider removing this logic at all
    individualHooks = true,
  }: { individualHooks?: boolean } = {},
) => {
  const where = { id, userId };

  await Transactions.update(removeUndefinedKeys(payload), {
    where,
    individualHooks,
  });

  // Return transactions exactly like that. Ading `returning: true` causes balances not being updated
  return getTransactionById({ id, userId }) as Promise<Transactions>;
};

export const updateTransactions = (
  payload: {
    amount?: number;
    note?: string;
    time?: Date;
    transactionType?: TRANSACTION_TYPES;
    paymentType?: PAYMENT_TYPES;
    accountId?: number;
    categoryId?: number;
    accountType?: ACCOUNT_TYPES;
    currencyId?: number;
    refCurrencyCode?: string;
    refundLinked?: boolean;
  },
  where: Record<string, unknown> & { userId: number },
  {
    // For refunds we need to have an option to disable them. Otherwise there will be some kind of
    // deadlock - request stucks forever with no error message. TODO: consider removing this logic at all
    individualHooks = true,
  }: { individualHooks?: boolean } = {},
) => {
  return Transactions.update(removeUndefinedKeys(payload), {
    where,
    individualHooks,
  });
};

export const deleteTransactionById = async ({ id, userId }: { id: number; userId: number }) => {
  const tx = await getTransactionById({ id, userId });

  if (!tx) return true;

  if (tx.accountType !== ACCOUNT_TYPES.system) {
    throw new ValidationError({
      message: "It's not allowed to manually delete external transactions",
    });
  }

  return Transactions.destroy({
    where: { id, userId },
    // So that BeforeDestroy will be triggered
    individualHooks: true,
  });
};
