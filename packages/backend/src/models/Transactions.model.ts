import {
  ACCOUNT_TYPES,
  CATEGORIZATION_SOURCE,
  CategorizationMeta,
  PAYMENT_TYPES,
  SORT_DIRECTIONS,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TransactionModel,
} from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import { isExist, removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/Accounts.model';
import Balances from '@models/Balances.model';
import Budgets from '@models/Budget.model';
import BudgetTransactions from '@models/BudgetTransactions.model';
import Categories from '@models/Categories.model';
import Currencies from '@models/Currencies.model';
import TransactionSplits from '@models/TransactionSplits.model';
import Users from '@models/Users.model';
import {
  CreationOptional,
  DataTypes,
  Includeable,
  InferAttributes,
  InferCreationAttributes,
  Model,
  NonAttribute,
  Op,
  WhereOptions,
} from '@sequelize/core';
import {
  AfterCreate,
  AfterUpdate,
  Attribute,
  AutoIncrement,
  BeforeCreate,
  BeforeDestroy,
  BeforeUpdate,
  BelongsTo,
  BelongsToMany,
  Default,
  HasMany,
  Index,
  NotNull,
  PrimaryKey,
  Table,
  Unique,
} from '@sequelize/core/decorators-legacy';
import { updateAccountBalanceForChangedTx } from '@services/accounts.service';

// TODO: replace with scopes
const prepareTXInclude = ({
  includeUser,
  includeAccount,
  includeCategory,
  includeSplits,
  includeAll,
  nestedInclude,
}: {
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeSplits?: boolean;
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
    if (isExist(includeSplits)) {
      include.push({
        model: TransactionSplits,
        as: 'splits',
        include: [{ model: Categories, as: 'category' }],
      });
    }
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
  } & Record<string, unknown>;
  commissionRate: number; // should be comission calculated as refAmount
  refCommissionRate: number; // should be comission calculated as refAmount
  cashbackAmount: number; // add to unified
  refundLinked: boolean;
  categorizationMeta: CategorizationMeta | null;
}

@Table({
  timestamps: false,
  tableName: 'Transactions',
  freezeTableName: true,
})
export default class Transactions extends Model<InferAttributes<Transactions>, InferCreationAttributes<Transactions>> {
  @Attribute(DataTypes.INTEGER)
  @PrimaryKey
  @AutoIncrement
  @Unique
  declare id: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare amount: CreationOptional<number>;

  // Amount in currency of account
  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare refAmount: CreationOptional<number>;

  @Attribute(DataTypes.STRING(2000))
  declare note: string | null;

  @Attribute(DataTypes.DATE)
  @NotNull
  @Default(DataTypes.NOW)
  declare time: CreationOptional<Date>;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare userId: number;

  @BelongsToMany(() => Budgets, {
    through: () => BudgetTransactions,
    foreignKey: 'transactionId',
    otherKey: 'budgetId',
  })
  declare budgets?: NonAttribute<Budgets[]>;

  @HasMany(() => TransactionSplits, 'transactionId')
  declare splits?: NonAttribute<TransactionSplits[]>;

  @Attribute(DataTypes.ENUM(...Object.values(TRANSACTION_TYPES)))
  @NotNull
  @Default(TRANSACTION_TYPES.income)
  declare transactionType: CreationOptional<TRANSACTION_TYPES>;

  @Attribute(DataTypes.ENUM(...Object.values(PAYMENT_TYPES)))
  @NotNull
  @Default(PAYMENT_TYPES.creditCard)
  declare paymentType: CreationOptional<PAYMENT_TYPES>;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare accountId: number | null;

  @BelongsTo(() => Accounts, 'accountId')
  declare account?: NonAttribute<Accounts>;

  @Attribute(DataTypes.INTEGER)
  @Index
  declare categoryId: number | null;

  @Attribute(DataTypes.STRING(3))
  @Index
  declare currencyCode: string | null;

  @Attribute(DataTypes.ENUM(...Object.values(ACCOUNT_TYPES)))
  @NotNull
  @Default(ACCOUNT_TYPES.system)
  declare accountType: CreationOptional<ACCOUNT_TYPES>;

  @Attribute(DataTypes.STRING(3))
  declare refCurrencyCode: string | null;

  @Attribute(DataTypes.ENUM(...Object.values(TRANSACTION_TRANSFER_NATURE)))
  @NotNull
  @Default(TRANSACTION_TRANSFER_NATURE.not_transfer)
  declare transferNature: CreationOptional<TRANSACTION_TRANSFER_NATURE>;

  // (hash, used to connect two transactions)
  @Attribute(DataTypes.INTEGER)
  declare transferId: string | null;

  // Stores the original id from external source
  @Attribute(DataTypes.STRING)
  declare originalId: string | null;

  // Stores the data from external source
  @Attribute(DataTypes.JSONB)
  declare externalData: TransactionsAttributes['externalData'] | null;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare commissionRate: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare refCommissionRate: CreationOptional<number>;

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  declare cashbackAmount: CreationOptional<number>;

  // Represents if the transaction refunds another tx, or is being refunded by other. Added only for
  // optimization purposes. All the related refund information is stored in the "RefundTransactions"
  // table
  @Attribute(DataTypes.BOOLEAN)
  @NotNull
  @Default(false)
  declare refundLinked: CreationOptional<boolean>;

  // Metadata about how this transaction was categorized (manual, ai, mcc_rule, user_rule)
  @Attribute(DataTypes.JSONB)
  declare categorizationMeta: CategorizationMeta | null;

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
    const { accountType, accountId, userId, currencyCode, refAmount, amount, transactionType } = instance;

    if (accountType === ACCOUNT_TYPES.system) {
      await updateAccountBalanceForChangedTx({
        userId,
        accountId,
        amount,
        refAmount,
        transactionType,
        currencyCode,
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
          currencyCode: prevData.currencyCode,
        });

        // Update new tx
        await updateAccountBalanceForChangedTx({
          userId: newData.userId,
          accountId: newData.accountId,
          amount: newData.amount,
          refAmount: newData.refAmount,
          transactionType: newData.transactionType,
          currencyCode: newData.currencyCode,
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
          currencyCode: newData.currencyCode,
        });
      }
    }

    const originalData = {
      accountId: prevData.accountId,
      amount: prevData.amount,
      refAmount: prevData.refAmount,
      time: prevData.time,
      transactionType: prevData.transactionType,
      currencyCode: prevData.currencyCode,
    } as Transactions;

    await Balances.handleTransactionChange({
      data: newData,
      prevData: originalData,
    });
  }

  @BeforeDestroy
  static async updateAccountBalanceBeforeDestroy(instance: Transactions) {
    const { accountType, accountId, userId, currencyCode, refAmount, amount, transactionType } = instance;

    if (accountType === ACCOUNT_TYPES.system) {
      await updateAccountBalanceForChangedTx({
        userId,
        accountId,
        prevAmount: amount,
        prevRefAmount: refAmount,
        transactionType,
        currencyCode,
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
  budgetIds,
  excludedBudgetIds,
  userId,
  order = SORT_DIRECTIONS.desc,
  includeUser,
  includeAccount,
  transactionType,
  includeCategory,
  includeSplits,
  includeAll,
  nestedInclude,
  isRaw = false,
  excludeTransfer,
  excludeRefunds,
  startDate,
  endDate,
  amountGte,
  amountLte,
  categoryIds,
  noteSearch,
  attributes,
  categorizationSource,
}: {
  from: number;
  limit?: number;
  accountType?: ACCOUNT_TYPES;
  transactionType?: TRANSACTION_TYPES;
  accountIds?: number[];
  budgetIds?: number[];
  excludedBudgetIds?: number[];
  userId: number;
  order?: SORT_DIRECTIONS;
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeSplits?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
  isRaw: boolean;
  excludeTransfer?: boolean;
  excludeRefunds?: boolean;
  startDate?: string;
  endDate?: string;
  amountGte?: number;
  amountLte?: number;
  categoryIds?: number[];
  noteSearch?: string[]; // array of keywords
  attributes?: (keyof Transactions)[];
  categorizationSource?: CATEGORIZATION_SOURCE;
}) => {
  const include = prepareTXInclude({
    includeUser,
    includeAccount,
    includeCategory,
    includeSplits,
    includeAll,
    nestedInclude,
  });
  const queryInclude: Includeable[] = Array.isArray(include) ? include : include ? [include] : [];

  const whereClause: WhereOptions<Transactions> = {
    userId,
    ...removeUndefinedKeys({
      accountType,
      transactionType,
      transferNature: excludeTransfer ? TRANSACTION_TRANSFER_NATURE.not_transfer : undefined,
      refundLinked: excludeRefunds ? false : undefined,
    }),
  };

  if (categoryIds && categoryIds.length > 0) {
    // Find transactions that have splits with any of the requested category IDs
    const transactionIdsWithMatchingSplits = await TransactionSplits.findAll({
      attributes: ['transactionId'],
      where: {
        userId,
        categoryId: { [Op.in]: categoryIds },
      },
      raw: true,
    }).then((results) => [...new Set(results.map((r) => r.transactionId))]);

    if (transactionIdsWithMatchingSplits.length > 0) {
      // Include transactions where primary category matches OR has splits with matching category
      whereClause[Op.or as unknown as string] = [
        { categoryId: { [Op.in]: categoryIds } },
        { id: { [Op.in]: transactionIdsWithMatchingSplits } },
      ];
    } else {
      // No splits match, just filter by primary categoryId
      whereClause.categoryId = {
        [Op.in]: categoryIds,
      };
    }
  }

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

  if (budgetIds?.length) {
    queryInclude.push({
      model: Budgets,
      through: { attributes: [], where: { budgetId: { [Op.in]: budgetIds } } },
      attributes: [],
      required: true,
    });
  }

  if (excludedBudgetIds?.length) {
    const excludedTransactionIds = await BudgetTransactions.findAll({
      attributes: ['transactionId'],
      where: {
        budgetId: {
          [Op.in]: excludedBudgetIds,
        },
      },
      raw: true,
    }).then((results) => results.map((r) => r.transactionId));

    if (excludedTransactionIds.length > 0) {
      whereClause.id = {
        [Op.notIn]: excludedTransactionIds,
      };
    }
  }

  // Add note search condition if provided
  if (noteSearch && noteSearch.length > 0) {
    whereClause.note = {
      [Op.or]: noteSearch.map((term) => ({
        [Op.iLike]: `%${term}%`,
      })),
    };
  }

  // Filter by categorization source (stored in JSONB field)
  if (categorizationSource) {
    whereClause['categorizationMeta.source'] = categorizationSource;
  }

  const transactions = await Transactions.findAll({
    include: queryInclude,
    where: whereClause,
    offset: from,
    limit: Number.isFinite(limit) ? limit : undefined,
    order: [['time', order]],
    raw: isRaw,
    // When raw is true and includeSplits is requested, use nest to preserve nested structure
    nest: isRaw && includeSplits ? true : undefined,
    attributes,
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
  includeSplits,
  includeAll,
  nestedInclude,
}: {
  id: number;
  userId: number;
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeSplits?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
}): Promise<Transactions | null> => {
  const include = prepareTXInclude({
    includeUser,
    includeAccount,
    includeCategory,
    includeSplits,
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
  includeSplits,
  includeAll,
  nestedInclude,
}: {
  transferId: string;
  userId: number;
  includeUser?: boolean;
  includeAccount?: boolean;
  includeCategory?: boolean;
  includeSplits?: boolean;
  includeAll?: boolean;
  nestedInclude?: boolean;
}) => {
  const include = prepareTXInclude({
    includeUser,
    includeAccount,
    includeCategory,
    includeSplits,
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
    currencyCode?: string;
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
