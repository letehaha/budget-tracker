import type {
  AccountMappingConfig,
  CategoryMappingConfig,
  ExecuteImportResponse,
  ImportError,
  ParsedTransactionRow,
  TransactionImportDetails,
} from '@bt/shared/types';
import {
  ACCOUNT_CATEGORIES,
  ACCOUNT_TYPES,
  CATEGORY_TYPES,
  ImportSource,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import * as Accounts from '@models/Accounts.model';
import Categories from '@models/Categories.model';
import * as Transactions from '@models/Transactions.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { withTransaction } from '@services/common/with-transaction';
import { addUserCurrencies } from '@services/currencies/add-user-currency';
import { v4 as uuidv4 } from 'uuid';

interface ExecuteImportParams {
  userId: number;
  validRows: ParsedTransactionRow[];
  accountMapping: AccountMappingConfig;
  categoryMapping: CategoryMappingConfig;
  skipDuplicateIndices: number[];
}

/**
 * Execute the import - creates accounts, categories, and transactions
 * All operations are done in a single database transaction (all-or-nothing)
 */
async function executeImportImpl({
  userId,
  validRows,
  accountMapping,
  categoryMapping,
  skipDuplicateIndices,
}: ExecuteImportParams): Promise<ExecuteImportResponse> {
  const batchId = uuidv4();
  const importedAt = new Date();

  // Filter out duplicates that should be skipped
  const skipSet = new Set(skipDuplicateIndices);
  const rowsToImport = validRows.filter((row) => !skipSet.has(row.rowIndex));

  if (rowsToImport.length === 0) {
    return {
      summary: {
        imported: 0,
        skipped: skipDuplicateIndices.length,
        accountsCreated: 0,
        categoriesCreated: 0,
        errors: [],
      },
      newTransactionIds: [],
      batchId,
    };
  }

  // Collect unique currencies from rows to import
  const uniqueCurrencies = new Set(rowsToImport.map((r) => r.currencyCode));

  // Add all currencies to user's currencies
  await addUserCurrencies(Array.from(uniqueCurrencies).map((code) => ({ userId, currencyCode: code })));

  // Create accounts that need to be created
  const accountNameToId = await createAccountsIfNeeded({
    userId,
    rowsToImport,
    accountMapping,
  });

  // Create categories that need to be created
  const categoryNameToId = await createCategoriesIfNeeded({
    userId,
    rowsToImport,
    categoryMapping,
  });

  // Count created accounts and categories
  let accountsCreated = 0;
  let categoriesCreated = 0;

  for (const [, mapping] of Object.entries(accountMapping)) {
    if (mapping.action === 'create-new') accountsCreated++;
  }
  for (const [, mapping] of Object.entries(categoryMapping)) {
    if (mapping.action === 'create-new') categoriesCreated++;
  }

  // Create transactions
  const errors: ImportError[] = [];
  const newTransactionIds: number[] = [];

  for (const row of rowsToImport) {
    try {
      const accountId = accountNameToId.get(row.accountName);
      if (!accountId) {
        errors.push({
          rowIndex: row.rowIndex,
          error: `Account "${row.accountName}" could not be resolved`,
        });
        continue;
      }

      const categoryId = row.categoryName ? categoryNameToId.get(row.categoryName) : null;

      // Calculate refAmount
      const refAmount = await calculateRefAmount({
        userId,
        amount: row.amount,
        baseCode: row.currencyCode,
        date: new Date(row.date),
      });

      const importDetails: TransactionImportDetails = {
        batchId,
        importedAt: importedAt.toISOString(),
        source: ImportSource.csv,
      };

      // Create transaction
      const transaction = await Transactions.createTransaction({
        userId,
        amount: row.amount,
        refAmount,
        note: row.description,
        time: new Date(row.date),
        transactionType: row.transactionType === 'income' ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
        paymentType: PAYMENT_TYPES.creditCard, // Default payment type
        accountId,
        categoryId: categoryId || undefined,
        currencyCode: row.currencyCode,
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
        rowIndex: row.rowIndex,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    summary: {
      imported: newTransactionIds.length,
      skipped: skipDuplicateIndices.length,
      accountsCreated,
      categoriesCreated,
      errors,
    },
    newTransactionIds,
    batchId,
  };
}

interface CreateAccountsParams {
  userId: number;
  rowsToImport: ParsedTransactionRow[];
  accountMapping: AccountMappingConfig;
}

async function createAccountsIfNeeded({
  userId,
  rowsToImport,
  accountMapping,
}: CreateAccountsParams): Promise<Map<string, number>> {
  const accountNameToId = new Map<string, number>();

  // Get unique account names from rows
  const uniqueAccountNames = new Set(rowsToImport.map((r) => r.accountName));

  for (const accountName of uniqueAccountNames) {
    const mapping = accountMapping[accountName];

    if (!mapping) {
      throw new ValidationError({
        message: `No mapping found for account "${accountName}"`,
      });
    }

    if (mapping.action === 'link-existing') {
      // Verify account exists
      const account = await Accounts.getAccountById({ userId, id: mapping.accountId });
      if (!account) {
        throw new ValidationError({
          message: `Account with ID ${mapping.accountId} not found`,
        });
      }
      accountNameToId.set(accountName, account.id);
    } else if (mapping.action === 'create-new') {
      // Get currency for this account from the first row that uses it
      const rowWithAccount = rowsToImport.find((r) => r.accountName === accountName);
      const currencyCode = rowWithAccount?.currencyCode;

      if (!currencyCode) {
        throw new ValidationError({
          message: `Cannot determine currency for new account "${accountName}"`,
        });
      }

      // Calculate ref values
      const refInitialBalance = await calculateRefAmount({
        userId,
        amount: 0,
        baseCode: currencyCode,
        date: new Date(),
      });

      // Create the account
      const newAccount = await Accounts.createAccount({
        userId,
        name: accountName,
        currencyCode,
        accountCategory: ACCOUNT_CATEGORIES.general,
        type: ACCOUNT_TYPES.system,
        initialBalance: 0,
        refInitialBalance,
        creditLimit: 0,
        refCreditLimit: 0,
        isEnabled: true,
      });

      if (newAccount) {
        accountNameToId.set(accountName, newAccount.id);
      }
    }
  }

  return accountNameToId;
}

interface CreateCategoriesParams {
  userId: number;
  rowsToImport: ParsedTransactionRow[];
  categoryMapping: CategoryMappingConfig;
}

async function createCategoriesIfNeeded({
  userId,
  rowsToImport,
  categoryMapping,
}: CreateCategoriesParams): Promise<Map<string, number>> {
  const categoryNameToId = new Map<string, number>();

  // Get unique category names from rows (excluding empty/null)
  const uniqueCategoryNames = new Set(rowsToImport.filter((r) => r.categoryName).map((r) => r.categoryName!));

  for (const categoryName of uniqueCategoryNames) {
    const mapping = categoryMapping[categoryName];

    if (!mapping) {
      // No mapping means category will be null for these transactions
      continue;
    }

    if (mapping.action === 'link-existing') {
      // Verify category exists
      const category = await Categories.findOne({
        where: { id: mapping.categoryId, userId },
      });
      if (!category) {
        throw new ValidationError({
          message: `Category with ID ${mapping.categoryId} not found`,
        });
      }
      categoryNameToId.set(categoryName, category.id);
    } else if (mapping.action === 'create-new') {
      // Create the category
      const newCategory = await Categories.create({
        userId,
        name: categoryName,
        color: getRandomColor(),
        type: CATEGORY_TYPES.custom,
      });

      categoryNameToId.set(categoryName, newCategory.id);
    }
  }

  return categoryNameToId;
}

function getRandomColor(): string {
  const colors = [
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // amber
    '#EF4444', // red
    '#8B5CF6', // purple
    '#EC4899', // pink
    '#06B6D4', // cyan
    '#F97316', // orange
  ];
  return colors[Math.floor(Math.random() * colors.length)]!;
}

export const executeImport = withTransaction(executeImportImpl);
