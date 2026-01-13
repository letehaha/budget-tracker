/**
 * Transaction Serializers
 *
 * Handles conversion between internal cents representation and API decimal format.
 * - Serializers: DB (cents) → API (decimal)
 * - Deserializers: API (decimal) → DB (cents)
 */
import {
  ACCOUNT_TYPES,
  type CentsAmount,
  type DecimalAmount,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  asCents,
  parseToCents,
  toDecimal,
} from '@bt/shared/types';
import type Tags from '@models/Tags.model';
import type TransactionSplits from '@models/TransactionSplits.model';
import type Transactions from '@models/Transactions.model';

// ============================================================================
// Response Types (API format with DecimalAmount)
// ============================================================================

export interface TransactionSplitApiResponse {
  id: string;
  categoryId: number;
  amount: DecimalAmount;
  refAmount: DecimalAmount;
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
  amount: DecimalAmount;
  refAmount: DecimalAmount;
  commissionRate: DecimalAmount;
  refCommissionRate: DecimalAmount;
  cashbackAmount: DecimalAmount;
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
// Serialized (Internal) Types (DB format with CentsAmount)
// ============================================================================

export interface CreateTransactionInternal {
  amount: CentsAmount;
  commissionRate?: CentsAmount;
  destinationAmount?: CentsAmount;
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
    amount: CentsAmount;
    note?: string | null;
  }>;
  tagIds?: number[];
  userId: number;
}

export interface UpdateTransactionInternal {
  amount?: CentsAmount;
  note?: string | null;
  time?: Date;
  transactionType?: string;
  paymentType?: string;
  accountId?: number;
  categoryId?: number | null;
  splits?: Array<{
    id?: string;
    categoryId: number;
    amount: CentsAmount;
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
    amount: toDecimal(asCents(split.amount)),
    refAmount: toDecimal(asCents(split.refAmount)),
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
    amount: toDecimal(asCents(tx.amount)),
    refAmount: toDecimal(asCents(tx.refAmount)),
    commissionRate: toDecimal(asCents(tx.commissionRate)),
    refCommissionRate: toDecimal(asCents(tx.refCommissionRate)),
    cashbackAmount: toDecimal(asCents(tx.cashbackAmount)),
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
    amount: parseToCents(req.amount),
    commissionRate: req.commissionRate !== undefined ? parseToCents(req.commissionRate) : undefined,
    destinationAmount: req.destinationAmount !== undefined ? parseToCents(req.destinationAmount) : undefined,
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
      amount: parseToCents(split.amount),
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
    amount: req.amount !== undefined ? parseToCents(req.amount) : undefined,
    note: req.note,
    time: req.time ? new Date(req.time) : undefined,
    transactionType: req.transactionType,
    paymentType: req.paymentType,
    accountId: req.accountId,
    categoryId: req.categoryId,
    splits: req.splits?.map((split) => ({
      id: split.id,
      categoryId: split.categoryId,
      amount: parseToCents(split.amount),
      note: split.note,
    })),
    tagIds: req.tagIds,
  };
}
