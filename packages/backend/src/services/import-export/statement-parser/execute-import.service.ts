import type {
  ExtractedTransaction,
  StatementExecuteImportResponse,
  StatementImportError,
  TransactionImportDetails,
} from '@bt/shared/types';
import {
  ACCOUNT_TYPES,
  ImportSource,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { Money } from '@common/types/money';
import { ValidationError } from '@js/errors';
import { trackImportCompleted } from '@js/utils/posthog';
import * as Accounts from '@models/accounts.model';
import * as Users from '@models/users.model';
import { queueCategorizationJob } from '@services/ai-categorization';
import { createTransaction } from '@services/transactions';
import { v4 as uuidv4 } from 'uuid';

interface ExecuteImportParams {
  userId: number;
  accountId: string;
  transactions: ExtractedTransaction[];
  skipIndices: number[];
}

/**
 * Execute a statement import into an existing account. Runs OUTSIDE a wrapping
 * transaction so a single bad transaction does not nuke the whole import —
 * best-effort partial success is the contract the user sees. Each row's
 * `createTransaction` opens its own transaction, so a row that fails at the
 * database layer rolls back only itself and is reported in `summary.errors`;
 * the rows around it still commit.
 *
 * Unlike CSV import, the account must already exist (no account creation).
 * Categories are not assigned during import - they can be auto-categorized later.
 */
async function executeImportImpl({
  userId,
  accountId,
  transactions,
  skipIndices,
}: ExecuteImportParams): Promise<StatementExecuteImportResponse> {
  const batchId = uuidv4();
  const importedAt = new Date();

  // Filter out transactions that should be skipped
  const skipSet = new Set(skipIndices);
  const transactionsToImport = transactions.filter((_, index) => !skipSet.has(index));

  if (transactionsToImport.length === 0) {
    return {
      summary: {
        imported: 0,
        skipped: skipIndices.length,
        errors: [],
      },
      newTransactionIds: [],
      batchId,
    };
  }

  // Verify account exists and belongs to user. The service-layer
  // createTransaction below derives currency from the account on its own;
  // we only need the existence check here.
  const account = await Accounts.getAccountById({ userId, id: accountId });
  if (!account) {
    throw new ValidationError({
      message: `Account with ID ${accountId} not found`,
    });
  }

  // Get user's default category
  const defaultCategoryId = await Users.getUserDefaultCategory({ id: userId });

  // Create transactions
  const errors: StatementImportError[] = [];
  const newTransactionIds: string[] = [];

  for (let i = 0; i < transactions.length; i++) {
    // Skip if in skip list
    if (skipSet.has(i)) {
      continue;
    }

    const tx = transactions[i]!;

    try {
      // Parse the date - handle both YYYY-MM-DD and YYYY-MM-DD HH:MM:SS formats
      const txDate = new Date(tx.date.replace(' ', 'T'));
      if (isNaN(txDate.getTime())) {
        errors.push({
          transactionIndex: i,
          error: `Invalid date format: "${tx.date}"`,
        });
        continue;
      }

      // Validate: no future dates (with 1-day tolerance for timezone differences)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);
      if (txDate > tomorrow) {
        errors.push({
          transactionIndex: i,
          error: `Transaction date "${tx.date}" is in the future`,
        });
        continue;
      }

      // Validate: amount must be positive (type determines income/expense direction)
      if (tx.amount <= 0) {
        errors.push({
          transactionIndex: i,
          error: `Amount must be positive, got: ${tx.amount}`,
        });
        continue;
      }

      // Validate: amount should not exceed reasonable threshold (1 billion)
      const MAX_AMOUNT = 1_000_000_000;
      if (tx.amount > MAX_AMOUNT) {
        errors.push({
          transactionIndex: i,
          error: `Amount ${tx.amount} exceeds maximum allowed value of ${MAX_AMOUNT}`,
        });
        continue;
      }

      // Note: tx.amount is in decimal format from AI extraction (e.g., 35 means 35.00)
      const amount = Money.fromDecimal(tx.amount);

      const importDetails: TransactionImportDetails = {
        batchId,
        importedAt: importedAt.toISOString(),
        source: ImportSource.statementParser,
      };

      // Service-layer createTransaction handles refAmount, payee extraction
      // (via `rawMerchantName`), and inline `payee_rule` auto-categorization.
      // Without this path the imported row would arrive at AI with
      // `categorizationMeta = null` and bypass any Payee defaults the user has
      // already set up.
      const [transaction] = await createTransaction({
        userId,
        amount,
        commissionRate: Money.zero(),
        note: tx.description,
        time: txDate,
        transactionType: tx.type === 'income' ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
        paymentType: PAYMENT_TYPES.creditCard,
        accountId,
        categoryId: defaultCategoryId,
        accountType: ACCOUNT_TYPES.system,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        externalData: {
          importDetails,
        },
        rawMerchantName: tx.merchant?.trim() || null,
      });

      if (transaction) {
        newTransactionIds.push(transaction.id);
      }
    } catch (error) {
      errors.push({
        transactionIndex: i,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Track analytics event
  if (newTransactionIds.length > 0) {
    trackImportCompleted({
      userId,
      importType: 'statement_parser',
      transactionsCount: newTransactionIds.length,
    });
  }

  return {
    summary: {
      imported: newTransactionIds.length,
      skipped: skipIndices.length,
      errors,
    },
    newTransactionIds,
    batchId,
  };
}

/**
 * Execute statement import and queue AI categorization for imported transactions.
 * The categorization is queued AFTER the per-row transactions have committed.
 */
export async function executeImport(params: ExecuteImportParams): Promise<StatementExecuteImportResponse> {
  const result = await executeImportImpl(params);

  // Queue AI categorization for the newly imported transactions. Each row was
  // committed by its own createTransaction call above, so the queued ids point
  // at rows that are durably persisted.
  if (result.newTransactionIds.length > 0) {
    await queueCategorizationJob({
      userId: params.userId,
      transactionIds: result.newTransactionIds,
    });
  }

  return result;
}
