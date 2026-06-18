import type {
  AccountMappingConfig,
  CategoryMappingConfig,
  ExecuteImportResponse,
  ImportError,
  ParsedTransactionRow,
  TagMappingConfig,
  TransactionImportDetails,
} from '@bt/shared/types';
import {
  ACCOUNT_CATEGORIES,
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
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { addUserCurrencies } from '@services/currencies/add-user-currency';
import { applyPayeeDefaultTags } from '@services/payees/apply-default-tags';
import { createTransaction } from '@services/transactions';
import { v4 as uuidv4 } from 'uuid';

import { createCategoriesIfNeeded } from './create-categories-if-needed';
import { createTagsIfNeeded } from './create-tags-if-needed';
import { resolveRowTagIds } from './resolve-row-tag-ids';

interface ExecuteImportParams {
  userId: number;
  validRows: ParsedTransactionRow[];
  accountMapping: AccountMappingConfig;
  categoryMapping: CategoryMappingConfig;
  /**
   * Per distinct source tag string, the action chosen by the user. Absent when
   * no tag column was mapped, in which case no tags are applied.
   */
  tagMapping?: TagMappingConfig;
  skipDuplicateIndices: number[];
  /**
   * Row indices for unpriceable rows the user chose to skip. Merged into the
   * same skip set as skipDuplicateIndices so they share the same rowIndex space.
   */
  skipUnpriceableIndices?: number[];
  defaultAccountId?: string;
  defaultCategoryId?: string;
}

/**
 * Execute a CSV import. Runs OUTSIDE a wrapping transaction so a single bad row
 * does not nuke the whole import — best-effort partial success is the contract
 * the user sees. Each row's `createTransaction` opens its own transaction, so a
 * row that fails at the database layer rolls back only itself and is reported in
 * `summary.errors`; the rows around it still commit. The up-front currency,
 * account, category, and tag creation each wrap themselves in `withTransaction`
 * further down the call stack, so they commit independently of the row loop too.
 */
async function executeImportImpl({
  userId,
  validRows,
  accountMapping,
  categoryMapping,
  tagMapping,
  skipDuplicateIndices,
  skipUnpriceableIndices,
  defaultAccountId,
  defaultCategoryId,
}: ExecuteImportParams): Promise<ExecuteImportResponse> {
  const batchId = uuidv4();
  const importedAt = new Date();

  // Merge duplicate and unpriceable skip indices into one set so both are
  // filtered with a single pass. Both sets use the same rowIndex space as
  // ParsedTransactionRow.rowIndex and DetectDuplicatesResponse.unpriceableRows.
  const skipSet = new Set([...skipDuplicateIndices, ...(skipUnpriceableIndices ?? [])]);
  const rowsToImport = validRows.filter((row) => !skipSet.has(row.rowIndex));

  // Count each skipped row exactly once: `skipped` owns confirmed duplicates;
  // `skippedUnpriceable` owns rows that are unpriceable but not also duplicates.
  // A row in both sets is already counted under `skipped`, so excluding the
  // duplicate-skip set from the unpriceable count prevents double-counting and
  // keeps imported + skipped + skippedUnpriceable == rows considered.
  const dupSkipSet = new Set(skipDuplicateIndices);
  const skippedUnpriceableCount = (skipUnpriceableIndices ?? []).filter((i) => !dupSkipSet.has(i)).length;

  if (rowsToImport.length === 0) {
    return {
      summary: {
        imported: 0,
        skipped: skipDuplicateIndices.length,
        skippedUnpriceable: skippedUnpriceableCount,
        accountsCreated: 0,
        categoriesCreated: 0,
        tagsCreated: 0,
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
    defaultAccountId,
  });

  // Resolve categories that need to be created or linked. `categoriesCreated`
  // counts only genuine inserts — create-new entries that matched an existing
  // same-named category (case-insensitive) link to it instead.
  const { categoryNameToId, categoriesCreated } = await createCategoriesIfNeeded({
    userId,
    categoryMapping,
  });

  // Resolve tags that need to be created or linked. `tagsCreated` counts only
  // genuine inserts — create-new entries that matched an existing same-named
  // tag (case-insensitive) link to it instead.
  const { tagNameToId, tagsCreated } = tagMapping
    ? await createTagsIfNeeded({ userId, tagMapping })
    : { tagNameToId: new Map<string, string>(), tagsCreated: 0 };

  // Count created accounts
  let accountsCreated = 0;

  for (const [, mapping] of Object.entries(accountMapping)) {
    if (mapping.action === 'create-new') accountsCreated++;
  }

  // Create transactions
  const errors: ImportError[] = [];
  const newTransactionIds: string[] = [];

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

      const categoryId = row.categoryName ? categoryNameToId.get(row.categoryName) : defaultCategoryId;

      const importDetails: TransactionImportDetails = {
        batchId,
        importedAt: importedAt.toISOString(),
        source: ImportSource.csv,
      };

      // Resolve the imported tags for this row: source names mapped to ids,
      // deduped (distinct names can resolve to the same id; a name can repeat
      // in the cell). Empty when the row carried no mapped tags.
      const rowTagIds = resolveRowTagIds({ tagNames: row.tagNames, tagNameToId });
      const hasImportedTags = rowTagIds.length > 0;

      // Service-layer createTransaction handles refAmount + currency from the
      // account, plus Payee extraction + payee_rule via `rawMerchantName` when
      // the user mapped a Payee column. Without this path the imported row
      // would arrive at AI with `categorizationMeta = null` and bypass any
      // Payee defaults the user has already set up.
      //
      // Passing `tagIds` makes createTransaction treat the row as having a
      // caller-decided tag set: it writes exactly those tags and skips its own
      // payee-default-tags step. To keep imported tags and payee defaults as a
      // UNION, this path re-applies the payee defaults additively below. When
      // the row has no imported tags, `tagIds` stays undefined so
      // createTransaction's built-in payee-default application runs unchanged.
      const [transaction] = await createTransaction({
        userId,
        amount: Money.fromCents(row.amount),
        commissionRate: Money.zero(),
        note: row.description,
        time: new Date(row.date),
        transactionType: row.transactionType === 'income' ? TRANSACTION_TYPES.income : TRANSACTION_TYPES.expense,
        paymentType: PAYMENT_TYPES.creditCard,
        accountId,
        categoryId: categoryId || undefined,
        accountType: ACCOUNT_TYPES.system,
        transferNature: TRANSACTION_TRANSFER_NATURE.not_transfer,
        externalData: {
          importDetails,
        },
        rawMerchantName: row.payeeName || null,
        tagIds: hasImportedTags ? rowTagIds : undefined,
      });

      if (transaction) {
        newTransactionIds.push(transaction.id);

        // Union step: when the row supplied its own tags, createTransaction did
        // not apply the payee's default tags (the explicit tagIds short-circuit
        // that). Add them here on top of the imported set — `applyPayeeDefaultTags`
        // is add-only and skips duplicates, so imported tags and payee defaults
        // coexist. The payeeId was resolved by createTransaction (caller-supplied
        // or extracted from `rawMerchantName`).
        if (hasImportedTags && transaction.payeeId) {
          await applyPayeeDefaultTags({
            accountOwnerUserId: userId,
            transactionId: transaction.id,
            payeeId: transaction.payeeId,
          });
        }
      }
    } catch (error) {
      errors.push({
        rowIndex: row.rowIndex,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Track analytics event
  if (newTransactionIds.length > 0) {
    trackImportCompleted({
      userId,
      importType: 'csv',
      transactionsCount: newTransactionIds.length,
    });
  }

  return {
    summary: {
      imported: newTransactionIds.length,
      skipped: skipDuplicateIndices.length,
      skippedUnpriceable: skippedUnpriceableCount,
      accountsCreated,
      categoriesCreated,
      tagsCreated,
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
  defaultAccountId?: string;
}

async function createAccountsIfNeeded({
  userId,
  rowsToImport,
  accountMapping,
  defaultAccountId,
}: CreateAccountsParams): Promise<Map<string, string>> {
  const accountNameToId = new Map<string, string>();

  // Get unique account names from rows
  const uniqueAccountNames = new Set(rowsToImport.map((r) => r.accountName));

  for (const accountName of uniqueAccountNames) {
    const mapping = accountMapping[accountName];

    if (!mapping) {
      // Fallback: when the user picked "single existing account" for the whole import,
      // accountName is empty for every row and per-name mapping is empty. Use defaultAccountId.
      if (defaultAccountId !== undefined) {
        const account = await Accounts.getAccountById({ userId, id: defaultAccountId });
        if (!account) {
          throw new ValidationError({
            message: `Account with ID ${defaultAccountId} not found`,
          });
        }
        accountNameToId.set(accountName, account.id);
        continue;
      }

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
        amount: Money.zero(),
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
        initialBalance: Money.zero(),
        refInitialBalance,
        creditLimit: Money.zero(),
        refCreditLimit: Money.zero(),
      });

      if (newAccount) {
        accountNameToId.set(accountName, newAccount.id);
      }
    }
  }

  return accountNameToId;
}

export const executeImport = executeImportImpl;
