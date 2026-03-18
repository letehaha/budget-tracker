import {
  ACCOUNT_TYPES,
  CATEGORIZATION_SOURCE,
  CategorizationMeta,
  FILTER_OPERATION,
  PAYMENT_TYPES,
  SORT_DIRECTIONS,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TransactionModel,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { moneyGetCents, moneySetCents } from '@common/types/money-column';
import { ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import BudgetTransactions from '@models/budget-transactions.model';
import Budgets from '@models/budget.model';
import Categories from '@models/categories.model';
import Tags from '@models/tags.model';
import TransactionGroupItems from '@models/transaction-group-items.model';
import TransactionGroups from '@models/transaction-groups.model';
import TransactionSplits from '@models/transaction-splits.model';
import TransactionTags from '@models/transaction-tags.model';
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
import { literal } from '@sequelize/core';
import {
  AfterCreate,
  AfterDestroy,
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

const prepareTXInclude = ({ includeSplits }: { includeSplits?: boolean }) => {
  const include: Includeable[] = [];

  if (includeSplits) {
    include.push({
      model: TransactionSplits,
      as: 'splits',
      include: [{ model: Categories, as: 'category' }],
    });
  }

  return include;
};

export interface TransactionsAttributes {
  id: number;
  amount: Money;
  /** Amount in user's base currency */
  refAmount: Money;
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
  commissionRate: Money;
  refCommissionRate: Money;
  cashbackAmount: Money;
  refundLinked: boolean;
  categorizationMeta: CategorizationMeta | null;
  createdAt: Date;
  updatedAt: Date;
}

@Table({
  timestamps: true,
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
  get amount(): Money {
    return moneyGetCents(this, 'amount');
  }
  set amount(val: Money | number) {
    moneySetCents(this, 'amount', val);
  }

  // Amount in currency of account
  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  get refAmount(): Money {
    return moneyGetCents(this, 'refAmount');
  }
  set refAmount(val: Money | number) {
    moneySetCents(this, 'refAmount', val);
  }

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

  @BelongsToMany(() => Tags, {
    through: () => TransactionTags,
    foreignKey: 'transactionId',
    otherKey: 'tagId',
  })
  declare tags?: NonAttribute<Tags[]>;

  @BelongsToMany(() => TransactionGroups, {
    through: () => TransactionGroupItems,
    foreignKey: 'transactionId',
    otherKey: 'groupId',
  })
  declare transactionGroups?: NonAttribute<TransactionGroups[]>;

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

  @BelongsTo(() => Categories, 'categoryId')
  declare category?: NonAttribute<Categories>;

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
  @Attribute(DataTypes.STRING)
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
  get commissionRate(): Money {
    return moneyGetCents(this, 'commissionRate');
  }
  set commissionRate(val: Money | number) {
    moneySetCents(this, 'commissionRate', val);
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  get refCommissionRate(): Money {
    return moneyGetCents(this, 'refCommissionRate');
  }
  set refCommissionRate(val: Money | number) {
    moneySetCents(this, 'refCommissionRate', val);
  }

  @Attribute(DataTypes.INTEGER)
  @NotNull
  @Default(0)
  get cashbackAmount(): Money {
    return moneyGetCents(this, 'cashbackAmount');
  }
  set cashbackAmount(val: Money | number) {
    moneySetCents(this, 'cashbackAmount', val);
  }

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

  // Managed by Sequelize (timestamps: true)
  declare createdAt: Date;
  declare updatedAt: Date;

  // User should set all of requiredFields for transfer transaction
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

    // dataValues/previousDataValues are raw DB values (cents integers), not Money.
    // Convert in-place so downstream code that expects Money objects works correctly.
    const MONEY_FIELDS = ['amount', 'refAmount', 'commissionRate', 'refCommissionRate', 'cashbackAmount'] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newRaw = newData as any,
      prevRaw = prevData as any;
    for (const field of MONEY_FIELDS) {
      newRaw[field] = Money.fromCents(newRaw[field]);
      prevRaw[field] = Money.fromCents(prevRaw[field]);
    }

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

    // Capture group membership BEFORE CASCADE deletes the join rows.
    // Stored on the instance so @AfterDestroy can check only the affected groups.
    const groupItems = await TransactionGroupItems.findAll({
      where: { transactionId: instance.id },
      attributes: ['groupId'],
      raw: true,
    });
    (instance as unknown as Record<string, unknown>)._affectedGroupIds = groupItems.map((item) => item.groupId);
  }

  @AfterDestroy
  static async autoDissolveEmptyGroups(instance: Transactions) {
    // After CASCADE removes the join row, check only the groups this transaction belonged to.
    const affectedGroupIds = (instance as unknown as Record<string, unknown>)._affectedGroupIds as number[] | undefined;

    if (!affectedGroupIds || affectedGroupIds.length === 0) return;

    const underMinGroups = (await TransactionGroups.findAll({
      where: {
        id: { [Op.in]: affectedGroupIds },
        [Op.and]: literal(`(
          SELECT COUNT(*)
          FROM "TransactionGroupItems"
          WHERE "TransactionGroupItems"."groupId" = "TransactionGroups"."id"
        ) < 2`),
      },
      attributes: ['id'],
      raw: true,
    })) as TransactionGroups[];

    const idsToDelete = underMinGroups.map((g) => g.id);
    if (idsToDelete.length > 0) {
      await TransactionGroups.destroy({ where: { id: { [Op.in]: idsToDelete } } });
    }
  }
}

function buildTransferCondition(filter: FILTER_OPERATION | undefined): Record<string, unknown> | null {
  if (filter === FILTER_OPERATION.exclude) return { transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer };
  if (filter === FILTER_OPERATION.only)
    return { transferNature: { [Op.ne]: TRANSACTION_TRANSFER_NATURE.not_transfer } };
  return null;
}

function buildRefundCondition(filter: FILTER_OPERATION | undefined): Record<string, unknown> | null {
  if (filter === FILTER_OPERATION.exclude) return { refundLinked: false };
  if (filter === FILTER_OPERATION.only) return { refundLinked: true };
  return null;
}

export const findWithFilters = async ({
  from = 0,
  limit = 20,
  accountType,
  accountIds,
  excludeAccountIds,
  budgetIds,
  excludedBudgetIds,
  tagIds,
  excludedTagIds,
  userId,
  order = SORT_DIRECTIONS.desc,
  transactionType,
  includeSplits,
  includeTags,
  includeGroups,
  isRaw = false,
  excludeTransfer,
  excludeRefunds,
  transferFilter,
  refundFilter,
  startDate,
  endDate,
  amountGte,
  amountLte,
  refAmountGte,
  refAmountLte,
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
  /** Filter: exclude transactions from these account IDs */
  excludeAccountIds?: number[];
  budgetIds?: number[];
  excludedBudgetIds?: number[];
  tagIds?: number[];
  excludedTagIds?: number[];
  userId: number;
  order?: SORT_DIRECTIONS;
  includeSplits?: boolean;
  includeTags?: boolean;
  includeGroups?: boolean;
  isRaw?: boolean;
  excludeTransfer?: boolean;
  excludeRefunds?: boolean;
  transferFilter?: FILTER_OPERATION;
  refundFilter?: FILTER_OPERATION;
  startDate?: string;
  endDate?: string;
  /** Filter: amount >= this value */
  amountGte?: Money;
  /** Filter: amount <= this value */
  amountLte?: Money;
  /** Filter: refAmount >= this value - for cross-currency matching */
  refAmountGte?: Money;
  /** Filter: refAmount <= this value - for cross-currency matching */
  refAmountLte?: Money;
  categoryIds?: number[];
  noteSearch?: string[]; // array of keywords
  attributes?: (keyof Transactions)[];
  categorizationSource?: CATEGORIZATION_SOURCE;
}) => {
  const queryInclude: Includeable[] = prepareTXInclude({ includeSplits });

  // New enum params take priority over legacy booleans
  const resolvedTransferFilter = transferFilter ?? (excludeTransfer ? FILTER_OPERATION.exclude : undefined);
  const resolvedRefundFilter = refundFilter ?? (excludeRefunds ? FILTER_OPERATION.exclude : undefined);

  const transferCondition = buildTransferCondition(resolvedTransferFilter);
  const refundCondition = buildRefundCondition(resolvedRefundFilter);

  const whereClause: WhereOptions<Transactions> = {
    userId,
    ...removeUndefinedKeys({
      accountType,
      transactionType,
    }),
  };

  // When both filters are "only", use OR logic so the user can see
  // "refunds OR transfers" instead of the impossible "refunds AND transfers"
  if (
    transferCondition &&
    refundCondition &&
    resolvedTransferFilter === FILTER_OPERATION.only &&
    resolvedRefundFilter === FILTER_OPERATION.only
  ) {
    // Wrap in Op.and to avoid conflicting with category filter's Op.or
    whereClause[Op.and as unknown as string] = [{ [Op.or]: [transferCondition, refundCondition] }];
  } else {
    if (transferCondition) Object.assign(whereClause, transferCondition);
    if (refundCondition) Object.assign(whereClause, refundCondition);
  }

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

  if (excludeAccountIds && excludeAccountIds.length > 0) {
    whereClause.accountId = {
      ...(whereClause.accountId as object | undefined),
      [Op.notIn]: excludeAccountIds,
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
        [Op.between]: [amountGte.toCents(), amountLte.toCents()],
      };
    } else if (amountGte) {
      whereClause.amount[Op.gte] = amountGte.toCents();
    } else if (amountLte) {
      whereClause.amount[Op.lte] = amountLte.toCents();
    }
  }

  if (refAmountGte || refAmountLte) {
    whereClause.refAmount = {};
    if (refAmountGte && refAmountLte) {
      whereClause.refAmount = {
        [Op.between]: [refAmountGte.toCents(), refAmountLte.toCents()],
      };
    } else if (refAmountGte) {
      whereClause.refAmount[Op.gte] = refAmountGte.toCents();
    } else if (refAmountLte) {
      whereClause.refAmount[Op.lte] = refAmountLte.toCents();
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

  // Filter by tagIds - include only transactions with these tags
  if (tagIds?.length) {
    queryInclude.push({
      model: Tags,
      through: { attributes: [], where: { tagId: { [Op.in]: tagIds } } },
      attributes: [],
      required: true,
    });
  }

  // Exclude transactions with specific tags
  if (excludedTagIds?.length) {
    const excludedTransactionIds = await TransactionTags.findAll({
      attributes: ['transactionId'],
      where: {
        tagId: {
          [Op.in]: excludedTagIds,
        },
      },
      raw: true,
    }).then((results) => results.map((r) => r.transactionId));

    if (excludedTransactionIds.length > 0) {
      // Merge with existing id exclusions if any
      if (whereClause.id && (whereClause.id as Record<symbol, number[]>)[Op.notIn]) {
        const existingExclusions = (whereClause.id as Record<symbol, number[]>)[Op.notIn] as number[];
        whereClause.id = {
          [Op.notIn]: [...new Set([...existingExclusions, ...excludedTransactionIds])],
        };
      } else {
        whereClause.id = {
          // oxlint-disable-next-line unicorn/no-useless-fallback-in-spread
          ...((whereClause.id as object) || {}),
          [Op.notIn]: excludedTransactionIds,
        };
      }
    }
  }

  // Include tags in response if requested
  // Note: when filtering by tagIds, we add a separate non-required include to get all tags
  if (includeTags) {
    // Remove any existing Tags include from tagIds filtering (which was required: true)
    const tagFilterIndex = queryInclude.findIndex((inc) => (inc as { model?: unknown }).model === Tags);
    if (tagFilterIndex !== -1) {
      queryInclude.splice(tagFilterIndex, 1);
    }

    // Add tags include for display (with filtering if tagIds provided)
    queryInclude.push({
      model: Tags,
      through: {
        attributes: [],
        ...(tagIds?.length ? { where: { tagId: { [Op.in]: tagIds } } } : {}),
      },
      attributes: ['id', 'name', 'color', 'icon'],
      required: !!tagIds?.length,
    });
  }

  // Add note search condition if provided
  if (noteSearch && noteSearch.length > 0) {
    whereClause.note = {
      [Op.or]: noteSearch.map((term) => ({
        [Op.iLike]: `%${term}%`,
      })),
    };
  }

  // Include group membership info if requested
  if (includeGroups) {
    queryInclude.push({
      model: TransactionGroups,
      through: { attributes: [] },
      attributes: ['id', 'name'],
      required: false,
    });
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
    // When raw is true and includeSplits/includeTags is requested, use nest to preserve nested structure
    nest: isRaw && (includeSplits || includeTags) ? true : undefined,
    attributes,
  });

  return transactions;
};

export const getTransactionById = ({
  id,
  userId,
  includeSplits,
}: {
  id: number;
  userId: number;
  includeSplits?: boolean;
}): Promise<Transactions | null> => {
  const include = prepareTXInclude({ includeSplits });

  return Transactions.findOne({
    where: { id, userId },
    include,
  });
};

export const getTransactionsByTransferId = ({ transferId, userId }: { transferId: string; userId: number }) => {
  return Transactions.findAll({
    where: { transferId, userId },
  });
};

export const getTransactionsByArrayOfField = async <T extends keyof TransactionModel>({
  fieldValues,
  fieldName,
  userId,
}: {
  fieldValues: TransactionModel[T][];
  fieldName: T;
  userId: number;
}) => {
  return Transactions.findAll({
    where: {
      [fieldName]: {
        [Op.in]: fieldValues,
      },
      userId,
    },
  });
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
  amount?: Money;
  refAmount?: Money;
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
  categorizationMeta?: CategorizationMeta | null;
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
    amount?: Money;
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
