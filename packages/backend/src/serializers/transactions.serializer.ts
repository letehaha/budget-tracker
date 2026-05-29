/**
 * Transaction Serializers
 *
 * Serializes transaction model instances for API responses.
 * Money fields auto-convert via .toNumber().
 * Deserializers convert API decimal inputs to Money.
 */
import { ACCOUNT_TYPES, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import type { RecordId } from '@bt/shared/types';
import { Money, centsToApiDecimal } from '@common/types/money';
import type Tags from '@models/tags.model';
import type TransactionGroups from '@models/transaction-groups.model';
import type TransactionSplits from '@models/transaction-splits.model';
import type Transactions from '@models/transactions.model';

// ============================================================================
// Response Types
// ============================================================================

interface TransactionSplitApiResponse {
  id: string;
  categoryId: string;
  amount: number;
  refAmount: number;
  note: string | null;
  category?: {
    id: string;
    name: string;
    color: string;
    icon: string;
  };
}

export interface TransactionApiResponse {
  id: string;
  amount: number;
  refAmount: number;
  commissionRate: number;
  refCommissionRate: number;
  cashbackAmount: number;
  note: string | null;
  time: string;
  userId: number;
  transactionType: string;
  paymentType: string;
  accountId: string | null;
  categoryId: string | null;
  currencyCode: string | null;
  accountType: string;
  refCurrencyCode: string | null;
  transferNature: string;
  transferId: string | null;
  originalId: string | null;
  externalData: Record<string, unknown> | null;
  refundLinked: boolean;
  createdAt: string;
  updatedAt: string;
  splits?: TransactionSplitApiResponse[];
  tags?: Array<{
    id: string;
    name: string;
    color: string;
    icon: string | null;
  }>;
  transactionGroups?: Array<{
    id: string;
    name: string;
  }>;
  /** Recipient who attached this tx to a shared budget. Present (and possibly `null`)
   *  only on budget-scoped fetches; absent on the global tx list and on detail lookups
   *  outside a budget context. `null` means owner-attached (no chip needed in the UI). */
  addedBy?: { id: number; username: string; avatar: string | null } | null;
  /** Whether the caller has write access to this row. The frontend uses this to render
   *  an inert "Transaction Details" dialog (disabled fields, hidden submit/delete) when
   *  the caller can see the tx — typically via a budget share — but has no write claim
   *  on the parent account. Absent on paths that don't compute it (single-tx writes,
   *  internal fetches). */
  canEdit?: boolean;
}

// ============================================================================
// Request Types (API format with decimal input)
// ============================================================================

interface CreateTransactionRequest {
  amount: number; // decimal from API
  commissionRate?: number;
  destinationAmount?: number;
  note?: string | null;
  time?: string;
  transactionType: TRANSACTION_TYPES;
  paymentType: PAYMENT_TYPES;
  accountId: RecordId;
  destinationAccountId?: string;
  destinationTransactionId?: string;
  categoryId?: RecordId;
  accountType?: ACCOUNT_TYPES;
  transferNature: TRANSACTION_TRANSFER_NATURE;
  refundForTxId?: string;
  refundForSplitId?: string;
  splits?: Array<{
    categoryId: RecordId;
    amount: number; // decimal from API
    note?: string | null;
  }>;
  tagIds?: string[];
}

// ============================================================================
// Internal Types (DB format with Money)
// ============================================================================

interface CreateTransactionInternal {
  amount: Money;
  commissionRate?: Money;
  destinationAmount?: Money;
  note?: string;
  time?: Date;
  transactionType: TRANSACTION_TYPES;
  paymentType: PAYMENT_TYPES;
  accountId: RecordId;
  destinationAccountId?: string;
  destinationTransactionId?: string;
  categoryId?: RecordId;
  accountType: ACCOUNT_TYPES;
  transferNature: TRANSACTION_TRANSFER_NATURE;
  refundsTxId?: string;
  refundsSplitId?: string;
  splits?: Array<{
    categoryId: RecordId;
    amount: Money;
    note?: string | null;
  }>;
  tagIds?: string[];
  userId: number;
}

// ============================================================================
// Serializers (DB → API)
// ============================================================================

/**
 * Serialize a transaction split from DB format to API response
 */
function serializeTransactionSplit(
  split: TransactionSplits & { category?: { id: string; name: string; color: string; icon: string } },
): TransactionSplitApiResponse {
  return {
    id: split.id,
    categoryId: split.categoryId,
    amount: centsToApiDecimal(split.amount),
    refAmount: centsToApiDecimal(split.refAmount),
    note: split.note,
    ...(split.category && {
      category: {
        id: split.category.id,
        name: split.category.name,
        color: split.category.color,
        icon: split.category.icon,
      },
    }),
  };
}

/**
 * Serialize a transaction from DB format to API response
 */
export function serializeTransaction(
  tx: Transactions & {
    splits?: TransactionSplits[];
    tags?: Tags[];
    transactionGroups?: TransactionGroups[];
    addedBy?: { id: number; username: string; avatar: string | null } | null;
    canEdit?: boolean;
  },
): TransactionApiResponse {
  return {
    id: tx.id,
    amount: centsToApiDecimal(tx.amount),
    refAmount: centsToApiDecimal(tx.refAmount),
    commissionRate: centsToApiDecimal(tx.commissionRate),
    refCommissionRate: centsToApiDecimal(tx.refCommissionRate),
    cashbackAmount: centsToApiDecimal(tx.cashbackAmount),
    note: tx.note,
    time: tx.time instanceof Date ? tx.time.toISOString() : new Date(tx.time).toISOString(),
    userId: tx.userId,
    transactionType: tx.transactionType,
    paymentType: tx.paymentType,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    currencyCode: tx.currencyCode,
    accountType: tx.accountType,
    refCurrencyCode: tx.refCurrencyCode,
    transferNature: tx.transferNature,
    transferId: tx.transferId,
    originalId: tx.originalId,
    externalData: tx.externalData,
    refundLinked: tx.refundLinked,
    createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : new Date(tx.createdAt).toISOString(),
    updatedAt: tx.updatedAt instanceof Date ? tx.updatedAt.toISOString() : new Date(tx.updatedAt).toISOString(),
    ...(tx.splits && {
      splits: tx.splits.map((split) =>
        serializeTransactionSplit(
          split as TransactionSplits & { category?: { id: string; name: string; color: string; icon: string } },
        ),
      ),
    }),
    ...(tx.tags && {
      tags: tx.tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        icon: tag.icon,
      })),
    }),
    ...(tx.transactionGroups && {
      transactionGroups: tx.transactionGroups.map((group) => ({
        id: group.id,
        name: group.name,
      })),
    }),
    // `addedBy` is included whenever the upstream service attached it (budget-scoped
    // fetches). `null` is a meaningful value — "owner-attached" — and must be sent so
    // the frontend can distinguish "no metadata yet" from "tx is owned by the budget
    // owner". Use a property-existence check rather than truthiness to preserve null.
    ...('addedBy' in tx ? { addedBy: tx.addedBy ?? null } : {}),
    // `canEdit` is omitted on paths that don't compute it (write returns, internal
    // fetches). Property-existence check so an explicit `false` survives serialization.
    ...('canEdit' in tx ? { canEdit: tx.canEdit ?? false } : {}),
  };
}

/**
 * Serialize multiple transactions
 */
export function serializeTransactions(
  txs: Array<
    Transactions & {
      splits?: TransactionSplits[];
      tags?: Tags[];
      transactionGroups?: TransactionGroups[];
      addedBy?: { id: number; username: string; avatar: string | null } | null;
      canEdit?: boolean;
    }
  >,
): TransactionApiResponse[] {
  return txs.map(serializeTransaction);
}

/**
 * Serialize a transaction tuple result from create/update operations.
 * These operations return [baseTx, oppositeTx?] for transfer transactions.
 */
export function serializeTransactionTuple(
  result: [baseTx: Transactions, oppositeTx?: Transactions],
): [TransactionApiResponse, TransactionApiResponse?] {
  const [baseTx, oppositeTx] = result;
  return oppositeTx ? [serializeTransaction(baseTx), serializeTransaction(oppositeTx)] : [serializeTransaction(baseTx)];
}

// ============================================================================
// Deserializers (API → DB)
// ============================================================================

/**
 * Deserialize a create transaction request from API decimal format to internal cents format
 */
export function deserializeCreateTransaction(req: CreateTransactionRequest, userId: number): CreateTransactionInternal {
  return {
    amount: Money.fromDecimal(req.amount),
    commissionRate: req.commissionRate !== undefined ? Money.fromDecimal(req.commissionRate) : undefined,
    destinationAmount: req.destinationAmount !== undefined ? Money.fromDecimal(req.destinationAmount) : undefined,
    note: req.note || undefined,
    time: req.time ? new Date(req.time) : undefined,
    transactionType: req.transactionType,
    paymentType: req.paymentType,
    accountId: req.accountId,
    destinationAccountId: req.destinationAccountId,
    destinationTransactionId: req.destinationTransactionId,
    categoryId: req.categoryId,
    accountType: req.accountType ?? ACCOUNT_TYPES.system,
    transferNature: req.transferNature,
    refundsTxId: req.refundForTxId,
    refundsSplitId: req.refundForSplitId,
    splits: req.splits?.map((split) => ({
      categoryId: split.categoryId,
      amount: Money.fromDecimal(split.amount),
      note: split.note,
    })),
    tagIds: req.tagIds,
    userId,
  };
}
