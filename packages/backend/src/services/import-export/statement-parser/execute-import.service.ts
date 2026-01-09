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
import { ValidationError } from '@js/errors';
import { trackImportCompleted } from '@js/utils/posthog';
import * as Accounts from '@models/Accounts.model';
import * as Transactions from '@models/Transactions.model';
import * as Users from '@models/Users.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { v4 as uuidv4 } from 'uuid';

interface ExecuteImportParams {
  userId: number;
  accountId: number;
  transactions: ExtractedTransaction[];
  skipIndices: number[];
}

/**
 * Execute the statement import - creates transactions in the specified account.
 * All operations are done in a single database transaction (all-or-nothing).
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

  // Verify account exists and belongs to user
  const account = await Accounts.getAccountById({ userId, id: accountId });
  if (!account) {
    throw new ValidationError({
      message: `Account with ID ${accountId} not found`,
    });
  }

  const currencyCode = account.currencyCode;

  // Get user's default category
  const userDefaults = await Users.getUserDefaultCategory({ id: userId });
  const defaultCategoryId = userDefaults?.defaultCategoryId;

  // Create transactions
  const errors: StatementImportError[] = [];
  const newTransactionIds: number[] = [];

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

      // Calculate refAmount
      const refAmount = await calculateRefAmount({
        userId,
        amount: tx.amount,
        baseCode: currencyCode,
        date: txDate,
      });

      const importDetails: TransactionImportDetails = {
        batchId,
        importedAt: importedAt.toISOString(),
        source: ImportSource.statementParser,
      };

      // Create transaction
      const transaction = await Transactions.createTransaction({
        userId,
        amount: tx.amount,
        refAmount,
        note: tx.description,
        time: txDate,
        transactionType: tx.type === 'income' ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
        paymentType: PAYMENT_TYPES.creditCard, // Default payment type
        accountId,
        categoryId: defaultCategoryId, // Use user's default category
        currencyCode,
        accountType: ACCOUNT_TYPES.system,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        externalData: {
          importDetails,
        },
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

export const executeImport = withTransaction(executeImportImpl);
