/**
 * Transaction Serializers
 *
 * Serializes transaction model instances for API responses.
 * Money fields auto-convert via .toNumber().
 * Deserializers convert API decimal inputs to Money.
 */
import { ACCOUNT_TYPES, PAYMENT_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { Money, centsToApiDecimal } from '@common/types/money';
import type Tags from '@models/Tags.model';
import type TransactionSplits from '@models/TransactionSplits.model';
import type Transactions from '@models/Transactions.model';

// ============================================================================
// Response Types
// ============================================================================

export interface TransactionSplitApiResponse {
  id: string;
  categoryId: number;
  amount: number;
  refAmount: number;
  note: string | null;
  category?: {
    id: number;
    name: string;
    color: string;
    icon: string;
  };
}

export interface TransactionApiResponse {
  id: number;
  amount: number;
  refAmount: number;
  commissionRate: number;
  refCommissionRate: number;
  cashbackAmount: number;
  note: string | null;
  time: Date;
  userId: number;
  transactionType: string;
  paymentType: string;
  accountId: number;
  categoryId: number | null;
  currencyCode: string;
  accountType: string;
  refCurrencyCode: string | null;
  transferNature: string;
  transferId: string | null;
  originalId: string | null;
  externalData: Record<string, unknown> | null;
  refundLinked: boolean;
  createdAt: Date;
  updatedAt: Date;
  splits?: TransactionSplitApiResponse[];
  tags?: Array<{
    id: number;
    name: string;
    color: string;
    icon: string | null;
  }>;
}

// ============================================================================
// Request Types (API format with decimal input)
// ============================================================================

export interface CreateTransactionRequest {
  amount: number; // decimal from API
  commissionRate?: number;
  destinationAmount?: number;
  note?: string | null;
  time?: string;
  transactionType: TRANSACTION_TYPES;
  paymentType: PAYMENT_TYPES;
  accountId: number;
  destinationAccountId?: number;
  destinationTransactionId?: number;
  categoryId?: number;
  accountType?: ACCOUNT_TYPES;
  transferNature: TRANSACTION_TRANSFER_NATURE;
  refundForTxId?: number;
  refundForSplitId?: string;
  splits?: Array<{
    categoryId: number;
    amount: number; // decimal from API
    note?: string | null;
  }>;
  tagIds?: number[];
}

export interface UpdateTransactionRequest {
  amount?: number;
  note?: string | null;
  time?: string;
  transactionType?: string;
  paymentType?: string;
  accountId?: number;
  categoryId?: number | null;
  splits?: Array<{
    id?: string;
    categoryId: number;
    amount: number;
    note?: string | null;
  }>;
  tagIds?: number[];
}

// ============================================================================
// Internal Types (DB format with Money)
// ============================================================================

export interface CreateTransactionInternal {
  amount: Money;
  commissionRate?: Money;
  destinationAmount?: Money;
  note?: string;
  time?: Date;
  transactionType: TRANSACTION_TYPES;
  paymentType: PAYMENT_TYPES;
  accountId: number;
  destinationAccountId?: number;
  destinationTransactionId?: number;
  categoryId?: number;
  accountType: ACCOUNT_TYPES;
  transferNature: TRANSACTION_TRANSFER_NATURE;
  refundsTxId?: number;
  refundsSplitId?: string;
  splits?: Array<{
    categoryId: number;
    amount: Money;
    note?: string | null;
  }>;
  tagIds?: number[];
  userId: number;
}

export interface UpdateTransactionInternal {
  amount?: Money;
  note?: string | null;
  time?: Date;
  transactionType?: string;
  paymentType?: string;
  accountId?: number;
  categoryId?: number | null;
  splits?: Array<{
    id?: string;
    categoryId: number;
    amount: Money;
    note?: string | null;
  }>;
  tagIds?: number[];
}

// ============================================================================
// Serializers (DB → API)
// ============================================================================

/**
 * Serialize a transaction split from DB format to API response
 */
export function serializeTransactionSplit(
  split: TransactionSplits & { category?: { id: number; name: string; color: string; icon: string } },
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
    time: tx.time,
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
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
    ...(tx.splits && {
      splits: tx.splits.map((split) =>
        serializeTransactionSplit(
          split as TransactionSplits & { category?: { id: number; name: string; color: string; icon: string } },
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
  };
}

/**
 * Serialize multiple transactions
 */
export function serializeTransactions(
  txs: Array<Transactions & { splits?: TransactionSplits[]; tags?: Tags[] }>,
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

/**
 * Deserialize an update transaction request from API decimal format to internal cents format
 */
export function deserializeUpdateTransaction(req: UpdateTransactionRequest): UpdateTransactionInternal {
  return {
    amount: req.amount !== undefined ? Money.fromDecimal(req.amount) : undefined,
    note: req.note,
    time: req.time ? new Date(req.time) : undefined,
    transactionType: req.transactionType,
    paymentType: req.paymentType,
    accountId: req.accountId,
    categoryId: req.categoryId,
    splits: req.splits?.map((split) => ({
      id: split.id,
      categoryId: split.categoryId,
      amount: Money.fromDecimal(split.amount),
      note: split.note,
    })),
    tagIds: req.tagIds,
  };
}
