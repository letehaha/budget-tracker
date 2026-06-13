import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  CategorizationMeta,
  CATEGORIZATION_SOURCE,
  FILTER_OPERATION,
  PAYMENT_TYPES,
  RecordId,
  SORT_DIRECTIONS,
  TRANSACTION_SORT_FIELD,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  TransactionCreatorSnapshot,
  TransactionModel,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { MoneyColumn, moneyGetCents, moneySetCents } from '@common/types/money-column';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { removeUndefinedKeys } from '@js/helpers';
import Accounts from '@models/accounts.model';
import Balances from '@models/balances.model';
import BudgetTransactions from '@models/budget-transactions.model';
import Budgets from '@models/budget.model';
import Categories from '@models/categories.model';
import Currencies from '@models/currencies.model';
import Payees from '@models/payees.model';
import Tags from '@models/tags.model';
import TransactionGroupItems from '@models/transaction-group-items.model';
import TransactionGroups from '@models/transaction-groups.model';
import TransactionSplits from '@models/transaction-splits.model';
import TransactionTags from '@models/transaction-tags.model';
import Users from '@models/users.model';
import { updateAccountBalanceForChangedTx } from '@services/accounts/update-balance-for-changed-tx';
import { Op, Includeable, Order, WhereOptions, literal } from 'sequelize';
import {
  Table,
  BeforeCreate,
  AfterCreate,
  AfterUpdate,
  AfterDestroy,
  BeforeDestroy,
  BeforeUpdate,
  Column,
  Model,
  Length,
  ForeignKey,
  DataType,
  BelongsTo,
  BelongsToMany,
  HasMany,
} from 'sequelize-typescript';
import { v7 as uuidv7 } from 'uuid';

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
  id: string;
  amount: Money;
  /** Amount in user's base currency */
  refAmount: Money;
  note: string;
  time: Date;
  userId: number;
  transactionType: TRANSACTION_TYPES;
  paymentType: PAYMENT_TYPES;
  accountId: string;
  categoryId: string;
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
  payeeId: string | null;
  payeeLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Table({
  timestamps: true,
  tableName: 'Transactions',
  freezeTableName: true,
})
export default class Transactions extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: () => uuidv7() })
  declare id: RecordId;

  @Column(MoneyColumn({ storage: 'cents' }))
  get amount(): Money {
    return moneyGetCents(this, 'amount');
  }
  set amount(val: Money | number) {
    moneySetCents(this, 'amount', val);
  }

  // Amount in curreny of account
  @Column(MoneyColumn({ storage: 'cents' }))
  get refAmount(): Money {
    return moneyGetCents(this, 'refAmount');
  }
  set refAmount(val: Money | number) {
    moneySetCents(this, 'refAmount', val);
  }

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

  @Column({ type: DataType.JSONB, allowNull: true, defaultValue: null })
  creatorSnapshot!: TransactionCreatorSnapshot | null;

  @BelongsToMany(() => Budgets, {
    through: { model: () => BudgetTransactions, unique: false },
    foreignKey: 'transactionId',
    otherKey: 'budgetId',
  })
  budgets!: Budgets[];

  @BelongsToMany(() => Tags, {
    through: { model: () => TransactionTags, unique: false },
    foreignKey: 'transactionId',
    otherKey: 'tagId',
  })
  tags!: Tags[];

  @BelongsToMany(() => TransactionGroups, {
    through: { model: () => TransactionGroupItems, unique: false },
    foreignKey: 'transactionId',
    otherKey: 'groupId',
  })
  transactionGroups!: TransactionGroups[];

  @HasMany(() => TransactionSplits)
  splits!: TransactionSplits[];

  @Column({
    allowNull: false,
    defaultValue: TRANSACTION_TYPES.income,
    type: DataType.ENUM(...Object.values(TRANSACTION_TYPES)),
  })
  transactionType!: TRANSACTION_TYPES;

  @Column({
    allowNull: false,
    defaultValue: PAYMENT_TYPES.creditCard,
    type: DataType.ENUM(...Object.values(PAYMENT_TYPES)),
  })
  paymentType!: PAYMENT_TYPES;

  @ForeignKey(() => Accounts)
  @Column({ allowNull: true, type: DataType.UUID })
  accountId!: RecordId;

  @BelongsTo(() => Accounts)
  account!: Accounts;

  @ForeignKey(() => Categories)
  @Column({ allowNull: true, type: DataType.UUID })
  categoryId!: RecordId;

  @BelongsTo(() => Categories)
  category!: Categories;

  @ForeignKey(() => Currencies)
  @Column({ allowNull: true, type: DataType.STRING(3) })
  currencyCode!: string;

  @Column({
    allowNull: false,
    defaultValue: ACCOUNT_TYPES.system,
    type: DataType.ENUM(...Object.values(ACCOUNT_TYPES)),
  })
  accountType!: ACCOUNT_TYPES;

  @ForeignKey(() => Currencies)
  @Column({ allowNull: true, defaultValue: null, type: DataType.STRING(3) })
  refCurrencyCode!: string;

  @Column({
    type: DataType.ENUM(...Object.values(TRANSACTION_TRANSFER_NATURE)),
    allowNull: false,
    defaultValue: TRANSACTION_TRANSFER_NATURE.not_transfer,
  })
  transferNature!: TRANSACTION_TRANSFER_NATURE;

  // (hash, used to connect two transactions)
  @Column({ allowNull: true, defaultValue: null, type: DataType.STRING })
  transferId!: RecordId;

  // Stores the original id from external source
  @Column({
    allowNull: true,
    type: DataType.STRING,
  })
  originalId!: string;

  // Stores the data from external source
  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  externalData!: TransactionsAttributes['externalData'];

  @Column(MoneyColumn({ storage: 'cents' }))
  get commissionRate(): Money {
    return moneyGetCents(this, 'commissionRate');
  }
  set commissionRate(val: Money | number) {
    moneySetCents(this, 'commissionRate', val);
  }

  @Column(MoneyColumn({ storage: 'cents' }))
  get refCommissionRate(): Money {
    return moneyGetCents(this, 'refCommissionRate');
  }
  set refCommissionRate(val: Money | number) {
    moneySetCents(this, 'refCommissionRate', val);
  }

  @Column(MoneyColumn({ storage: 'cents' }))
  get cashbackAmount(): Money {
    return moneyGetCents(this, 'cashbackAmount');
  }
  set cashbackAmount(val: Money | number) {
    moneySetCents(this, 'cashbackAmount', val);
  }

  // Represents if the transaction refunds another tx, or is being refunded by other. Added only for
  // optimization purposes. All the related refund information is tored in the "RefundTransactions"
  // table
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  refundLinked!: boolean;

  // Metadata about how this transaction was categorized (manual, ai, mcc_rule, user_rule, subscription_rule, payee_rule)
  @Column({
    type: DataType.JSONB,
    allowNull: true,
  })
  categorizationMeta!: CategorizationMeta | null;

  @ForeignKey(() => Payees)
  @Column({ allowNull: true, type: DataType.UUID })
  payeeId!: RecordId | null;

  @BelongsTo(() => Payees)
  payee!: Payees;

  // True when the user explicitly assigned or cleared payeeId; both the inline
  // sync-time extraction and the post-sync note fuzzy backfill skip rows with
  // this flag set so manual overrides survive resyncs.
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  payeeLocked!: boolean;

  // Managed by Sequelize (timestamps: true)
  declare createdAt: Date;
  declare updatedAt: Date;

  @BeforeCreate
  @BeforeUpdate
  static validateTransferRelatedFields(instance: Transactions) {
    const { transferNature, transferId, refAmount, refCurrencyCode } = instance;

    switch (transferNature) {
      case TRANSACTION_TRANSFER_NATURE.common_transfer:
      case TRANSACTION_TRANSFER_NATURE.transfer_to_loan: {
        // Loan payments are two-leg transfers between two user-owned Accounts
        // (the loan account is itself an `Accounts` row with accountCategory='loan'),
        // so they require the same paired-row fields as a regular common_transfer.
        // The distinct nature label exists only so reporting can isolate loan
        // payments without joining through the destination account's category.
        const requiredFields = [transferId, refCurrencyCode, refAmount];
        if (requiredFields.some((item) => item === undefined)) {
          throw new ValidationError({
            message: `All these fields should be passed (${requiredFields}) for transfer transaction.`,
          });
        }
        return;
      }
      case TRANSACTION_TRANSFER_NATURE.transfer_to_portfolio:
      case TRANSACTION_TRANSFER_NATURE.transfer_to_venture: {
        // Single-leg transfer: no paired transferId, but ref fields must still be set so
        // downstream aggregations can find the row. `refAmount == null` matches both null
        // and undefined returned by the Money getter when the underlying cents are null.
        if (!refCurrencyCode || refAmount == null) {
          throw new ValidationError({
            message: t({ key: 'transactions.refFieldsRequiredForTransferToPortfolio' }),
          });
        }
        return;
      }
      case TRANSACTION_TRANSFER_NATURE.not_transfer:
      case TRANSACTION_TRANSFER_NATURE.transfer_out_wallet:
        return;
      default: {
        const _exhaustiveCheck: never = transferNature;
        throw new Error(`Unhandled transferNature in validateTransferRelatedFields: ${_exhaustiveCheck}`);
      }
    }
  }

  /**
   * Vehicle-account write invariant — enforced at the lowest funnel every
   * transaction write passes through.
   *
   * A vehicle is a regular `Accounts` row (accountCategory: 'vehicle') whose
   * balance is owned by the lazy-depreciation model plus manual overrides. Its
   * value may ONLY change through the override flow, which records a
   * `transfer_out_wallet` row AND keeps `Vehicle.valueAnchor` in sync. Any other
   * transaction (income/expense, transfers in or out, transfer-to-portfolio or
   * -venture) would move `Account.currentBalance` without touching the anchor —
   * so the next lazy refresh recomputes from the stale anchor and silently
   * discards the change. That is data loss, not just a confusing UI state.
   *
   * Rejecting every nature except `transfer_out_wallet` here covers every path
   * that creates or moves a transaction row: the manage-transaction UI, MCP
   * tools, bank sync, CSV import, direct API calls and any future endpoint all
   * funnel through this model. The legit override path passes for free — it IS a
   * `transfer_out_wallet`. (Note: a vehicle's `currentBalance` can also move
   * WITHOUT a transaction row — via `accountsService.updateAccount` — so that
   * path is guarded separately in the service; this hook is not the whole story.)
   */
  @BeforeCreate
  @BeforeUpdate
  static async enforceVehicleAccountInvariant(instance: Transactions) {
    // `transfer_out_wallet` is the only nature ever valid on a vehicle account,
    // so short-circuit before the account lookup. The lookup still runs for
    // every other write (most income/expense/transfer rows) — it's a narrow
    // single-column PK read, and only the override/adjustment rows skip it.
    if (instance.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) return;

    const account = await Accounts.findByPk(instance.accountId, {
      attributes: ['accountCategory'],
    });
    // A missing account isn't a vehicle (FK / other validation rejects orphan
    // rows); only vehicle accounts are locked down here.
    if (account?.accountCategory !== ACCOUNT_CATEGORIES.vehicle) return;

    throw new ValidationError({
      message: t({ key: 'transactions.vehicleAccountReadonly' }),
    });
  }

  /**
   * Loan-account write invariant — enforced at the same lowest funnel as the
   * vehicle guard above.
   *
   * A loan is a regular `Accounts` row (accountCategory: 'loan', type: 'system')
   * whose balance is owned by the payment flow. The ONLY write it accepts is the
   * income leg of a `transfer_to_loan` payment, which `assertLoanPaymentAllowed`
   * has already overpay-checked before the row reaches this hook. Any other
   * transaction (plain income/expense, or a transfer that uses the loan account
   * as its source) would move `Account.currentBalance` outside that guard,
   * pushing the loan past its principal or otherwise corrupting the payoff
   * projection.
   *
   * Rejecting every nature except `transfer_to_loan` here covers every path that
   * creates or moves a transaction row: the manage-transaction UI, MCP tools,
   * bank sync, CSV import, direct API calls and any future endpoint all funnel
   * through this model. The legit payment passes for free — its income leg IS a
   * `transfer_to_loan`.
   */
  @BeforeCreate
  @BeforeUpdate
  static async enforceLoanAccountInvariant(instance: Transactions) {
    // `transfer_to_loan` is the only nature ever valid on a loan account (and it
    // is already overpay-checked by `assertLoanPaymentAllowed`), so short-circuit
    // before the account lookup. The lookup still runs for every other write —
    // it's a narrow single-column PK read, and only loan-payment legs skip it.
    if (instance.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_loan) return;

    const account = await Accounts.findByPk(instance.accountId, {
      attributes: ['accountCategory'],
    });
    // A missing account isn't a loan (FK / other validation rejects orphan rows);
    // only loan accounts are locked down here.
    if (account?.accountCategory !== ACCOUNT_CATEGORIES.loan) return;

    throw new ValidationError({
      message: t({ key: 'transactions.loanAccountReadonly' }),
    });
  }

  // A loan account's balance is recomputed (not deltad) whenever one of its
  // payment legs is created, edited, or destroyed. Lazy-imported to keep the
  // model layer free of a service-layer import cycle (same approach as the
  // vehicle anchor reconcile hook). recomputeLoanBalance no-ops for non-loan
  // accounts, so the caller only needs the cheap transfer-nature gate.
  private static async triggerLoanBalanceRecompute(accountId: string): Promise<void> {
    const { recomputeLoanBalance } = await import('@services/loans/recompute-loan-balance.service');
    await recomputeLoanBalance({ loanAccountId: accountId });
  }

  @AfterCreate
  static async updateAccountBalanceAfterCreate(instance: Transactions) {
    const { accountType, accountId, currencyCode, refAmount, amount, transactionType } = instance;

    if (accountType === ACCOUNT_TYPES.system) {
      await updateAccountBalanceForChangedTx({
        accountId,
        amount,
        refAmount,
        transactionType,
        currencyCode,
      });
    }

    await Balances.handleTransactionChange({ data: instance });
    // Only loan-transfer legs can change a loan's outstanding; gating on the
    // nature keeps the recompute (and its account lookup) off the hot path for
    // the overwhelming majority of transactions, which are not loan payments.
    if (instance.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_loan) {
      await Transactions.triggerLoanBalanceRecompute(instance.accountId);
    }
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
          accountId: prevData.accountId,
          prevAmount: prevData.amount,
          prevRefAmount: prevData.refAmount,
          transactionType: prevData.transactionType,
          currencyCode: prevData.currencyCode,
        });

        // Update new tx
        await updateAccountBalanceForChangedTx({
          accountId: newData.accountId,
          amount: newData.amount,
          refAmount: newData.refAmount,
          transactionType: newData.transactionType,
          currencyCode: newData.currencyCode,
        });
      } else {
        await updateAccountBalanceForChangedTx({
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

    // Recompute when either side of the edit is a loan-transfer leg — covers an
    // amount/date edit on a loan payment and the rare case of a leg moving onto
    // or off a loan account. Non-loan edits skip the lookup entirely.
    if (
      newData.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_loan ||
      prevData.transferNature === TRANSACTION_TRANSFER_NATURE.transfer_to_loan
    ) {
      await Transactions.triggerLoanBalanceRecompute(newData.accountId);
      if (newData.accountId !== prevData.accountId) {
        await Transactions.triggerLoanBalanceRecompute(prevData.accountId);
      }
    }
  }

  @BeforeDestroy
  static async updateAccountBalanceBeforeDestroy(instance: Transactions) {
    const { accountType, accountId, currencyCode, refAmount, amount, transactionType } = instance;

    if (accountType === ACCOUNT_TYPES.system) {
      await updateAccountBalanceForChangedTx({
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
  static async reconcileVehicleAnchorOnDelete(instance: Transactions) {
    // When a balance-adjustment ("transfer_out_wallet") tx on a vehicle account
    // is deleted, the user's manual override is being undone. Re-derive the
    // vehicle's depreciation anchor by walking the REMAINING overrides forward
    // from purchase. The cents-arithmetic Account.currentBalance decremented by
    // BeforeDestroy is not the right anchor value — once the override chain has
    // more than one entry, the prior override's post-tx value depends on the
    // curve between it and the deleted one, not on a flat subtraction.
    if (instance.transferNature !== TRANSACTION_TRANSFER_NATURE.transfer_out_wallet) return;

    const account = await Accounts.findByPk(instance.accountId);
    if (!account || account.accountCategory !== ACCOUNT_CATEGORIES.vehicle) return;

    // Lazy-imported to avoid circular dep (Vehicles model is in the same model layer).
    const { default: Vehicles } = await import('@models/vehicles.model');
    const vehicle = await Vehicles.findOne({ where: { accountId: instance.accountId } });
    if (!vehicle) return;

    const { reconstructVehicleAnchor } = await import('@services/vehicles/reconstruct-vehicle-anchor');
    const reconstructed = await reconstructVehicleAnchor({ vehicle });

    if (reconstructed.hasOverrides) {
      await vehicle.update({
        valueAnchor: reconstructed.value,
        valueAnchorDate: reconstructed.date,
        valueLastComputedAt: null,
      });
    } else {
      await vehicle.update({
        valueAnchor: null,
        valueAnchorDate: null,
        valueLastComputedAt: null,
      });
    }

    // Recompute synchronously so the response (and any immediate cache refetch)
    // reflects today's curve-derived value, not the BeforeDestroy intermediate.
    const { refreshVehicleValueIfStale } = await import('@services/vehicles/refresh-vehicle-value.service');
    await refreshVehicleValueIfStale({ vehicleId: vehicle.id, force: true });
  }

  @AfterDestroy
  static async recomputeLoanBalanceAfterDestroy(instance: Transactions) {
    // Runs after the row is gone so the deleted leg is excluded from the
    // post-anchor sum. Gated on the nature so non-loan deletes skip the lookup.
    if (instance.transferNature !== TRANSACTION_TRANSFER_NATURE.transfer_to_loan) return;
    await Transactions.triggerLoanBalanceRecompute(instance.accountId);
  }

  @AfterDestroy
  static async autoDissolveEmptyGroups(instance: Transactions) {
    // After CASCADE removes the join row, check only the groups this transaction belonged to.
    const affectedGroupIds = (instance as unknown as Record<string, unknown>)._affectedGroupIds as string[] | undefined;

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

/**
 * Builds the ORDER BY clause for `findWithFilters`. Name-based sorts resolve the
 * related record's name via a correlated subquery instead of a JOIN so the result
 * shape stays identical regardless of sort field. `NULLS LAST` keeps rows without
 * the related record (e.g. no payee assigned) at the bottom in both directions.
 * `time` + `id` act as stable tie-breakers so pagination never duplicates rows.
 */
function buildOrderClause({
  sortBy,
  order,
}: {
  sortBy: TRANSACTION_SORT_FIELD | undefined;
  order: SORT_DIRECTIONS;
}): Order {
  if (!sortBy || sortBy === TRANSACTION_SORT_FIELD.time) {
    return [
      ['time', order],
      ['id', order],
    ];
  }

  const sortExpressions: Record<Exclude<TRANSACTION_SORT_FIELD, TRANSACTION_SORT_FIELD.time>, string> = {
    [TRANSACTION_SORT_FIELD.refAmount]: '"Transactions"."refAmount"',
    [TRANSACTION_SORT_FIELD.accountName]:
      '(SELECT "name" FROM "Accounts" WHERE "Accounts"."id" = "Transactions"."accountId")',
    [TRANSACTION_SORT_FIELD.categoryName]:
      '(SELECT "name" FROM "Categories" WHERE "Categories"."id" = "Transactions"."categoryId")',
    [TRANSACTION_SORT_FIELD.payeeName]: '(SELECT "name" FROM "Payees" WHERE "Payees"."id" = "Transactions"."payeeId")',
    [TRANSACTION_SORT_FIELD.categorizationSource]: `("Transactions"."categorizationMeta"->>'source')`,
  };

  // `order` is a validated SORT_DIRECTIONS enum value ('ASC'/'DESC') — safe to interpolate.
  return [
    literal(`${sortExpressions[sortBy]} ${order} NULLS LAST`),
    ['time', SORT_DIRECTIONS.desc],
    ['id', SORT_DIRECTIONS.desc],
  ];
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
  sortBy,
  transferNatures,
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
  payeeIds,
  noteSearch,
  attributes,
  categorizationSource,
}: {
  from: number;
  limit?: number;
  accountType?: ACCOUNT_TYPES;
  transactionType?: TRANSACTION_TYPES;
  accountIds?: string[];
  /** Filter: exclude transactions from these account IDs */
  excludeAccountIds?: string[];
  budgetIds?: string[];
  excludedBudgetIds?: string[];
  tagIds?: string[];
  excludedTagIds?: string[];
  /**
   * Creator scope. Optional because the public-facing read-path uses an account-scoped
   * query (see `services/sharing/get-accessible-account-ids.service.ts`) so it can
   * surface transactions on shared accounts regardless of who created them. Internal
   * callers pass `userId` to keep their owner-scoped semantics.
   */
  userId?: number;
  order?: SORT_DIRECTIONS;
  /** Sort field; defaults to `time`. Name-based fields sort via correlated subqueries. */
  sortBy?: TRANSACTION_SORT_FIELD;
  /**
   * Exact set of transfer natures to include (e.g. `not_transfer` + selected transfer
   * kinds). When present, supersedes `transferFilter`/`excludeTransfer` — the caller
   * fully describes which natures it wants.
   */
  transferNatures?: TRANSACTION_TRANSFER_NATURE[];
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
  categoryIds?: string[];
  payeeIds?: string[];
  noteSearch?: string[]; // array of keywords
  attributes?: (keyof Transactions)[];
  categorizationSource?: CATEGORIZATION_SOURCE;
}) => {
  const queryInclude: Includeable[] = prepareTXInclude({ includeSplits });

  // New enum params take priority over legacy booleans
  const resolvedTransferFilter = transferFilter ?? (excludeTransfer ? FILTER_OPERATION.exclude : undefined);
  const resolvedRefundFilter = refundFilter ?? (excludeRefunds ? FILTER_OPERATION.exclude : undefined);

  // An explicit nature list fully describes which transferNature values to include,
  // so it replaces the coarse all/exclude/only condition.
  const transferCondition = transferNatures?.length
    ? { transferNature: { [Op.in]: transferNatures } }
    : buildTransferCondition(resolvedTransferFilter);
  const refundCondition = buildRefundCondition(resolvedRefundFilter);

  const whereClause: WhereOptions<Transactions> = {
    ...(userId !== undefined ? { userId } : {}),
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
    // Find transactions that have splits with any of the requested category IDs.
    // When `userId` is unset (account-scoped public read-path), we widen the lookup to
    // any user's splits — the outer accountId filter constrains the final rows to the
    // caller's accessible accounts, so this stays safe.
    const splitsWhere: Record<string, unknown> = { categoryId: { [Op.in]: categoryIds } };
    if (userId !== undefined) splitsWhere.userId = userId;
    const transactionIdsWithMatchingSplits = await TransactionSplits.findAll({
      attributes: ['transactionId'],
      where: splitsWhere,
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

  if (payeeIds && payeeIds.length > 0) {
    whereClause.payeeId = {
      [Op.in]: payeeIds,
    };
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
    const budgetTransactionIds = await BudgetTransactions.findAll({
      attributes: ['transactionId'],
      where: {
        budgetId: { [Op.in]: budgetIds },
      },
      raw: true,
    }).then((results) => results.map((r) => r.transactionId));

    whereClause.id = {
      ...(whereClause.id as object),
      [Op.in]: budgetTransactionIds,
    };
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
        ...(whereClause.id as object),
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
      if (whereClause.id && (whereClause.id as Record<symbol, string[]>)[Op.notIn]) {
        const existingExclusions = (whereClause.id as Record<symbol, string[]>)[Op.notIn] as string[];
        whereClause.id = {
          ...(whereClause.id as object),
          [Op.notIn]: [...new Set([...existingExclusions, ...excludedTransactionIds])],
        };
      } else {
        whereClause.id = {
          ...(whereClause.id as object),
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
    order: buildOrderClause({ sortBy, order }),
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
  id: string;
  userId: number;
  includeSplits?: boolean;
}): Promise<Transactions | null> => {
  const include = prepareTXInclude({ includeSplits });

  return Transactions.findOne({
    where: { id, userId },
    include,
  });
};

export const getTransactionsByTransferId = ({
  transferId,
  accountIds,
}: {
  transferId: string;
  accountIds: string[];
}) => {
  if (accountIds.length === 0) return Promise.resolve([] as Transactions[]);
  return Transactions.findAll({
    where: { transferId, accountId: { [Op.in]: accountIds } },
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
    | 'categorizationMeta'
    | 'payeeId'
    | 'payeeLocked'
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
  id: string;
  userId: number;
  amount?: Money;
  refAmount?: Money;
  note?: string | null;
  time?: Date;
  transactionType?: TRANSACTION_TYPES;
  paymentType?: PAYMENT_TYPES;
  accountId?: string;
  categoryId?: string;
  currencyCode?: string;
  refCurrencyCode?: string;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
  transferId?: string | null;
  refundLinked?: boolean;
  categorizationMeta?: CategorizationMeta | null;
  payeeId?: string | null;
  payeeLocked?: boolean;
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
    accountId?: string;
    categoryId?: string;
    accountType?: ACCOUNT_TYPES;
    currencyCode?: string;
    refCurrencyCode?: string;
    refundLinked?: boolean;
    payeeId?: string | null;
    payeeLocked?: boolean;
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

export const deleteTransactionById = async ({ id, userId }: { id: string; userId: number }) => {
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
