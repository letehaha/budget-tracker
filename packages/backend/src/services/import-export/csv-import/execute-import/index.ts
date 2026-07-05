import type {
  AccountMappingConfig,
  CategoryMappingConfig,
  CsvImportSummary,
  ImportError,
  ParsedTransactionRow,
  TagMappingConfig,
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
import { logger } from '@js/utils/logger';
import { trackImportCompleted } from '@js/utils/posthog';
import { addUserCurrencies } from '@services/currencies/add-user-currency';
import { createAccountsIfNeeded } from '@services/import-export/core/resolve/create-accounts-if-needed';
import { createCategoriesIfNeeded } from '@services/import-export/core/resolve/create-categories-if-needed';
import { createPayeesIfNeeded } from '@services/import-export/core/resolve/create-payees-if-needed';
import { createTagsIfNeeded } from '@services/import-export/core/resolve/create-tags-if-needed';
import { resolveRowTagIds } from '@services/import-export/core/resolve/resolve-row-tag-ids';
import { applyPayeeDefaultTags } from '@services/payees/apply-default-tags';
import { createTransaction } from '@services/transactions';
import { v4 as uuidv4 } from 'uuid';

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
  /**
   * Called with the cumulative `processedCount` after each successfully created
   * transaction so the BullMQ worker can fan progress out over SSE. `totalCount`
   * is the number of rows that will actually be imported (`rowsToImport.length`).
   * Optional — safe to omit in tests or one-shot callers.
   */
  onProgress?: (processedCount: number, totalCount: number) => void | Promise<void>;
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
  onProgress,
}: ExecuteImportParams): Promise<CsvImportSummary> {
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

  // Report the real total once up front so a no-op import still surfaces its
  // total and the worker reports the correct `totalCount` instead of 0.
  if (onProgress) await onProgress(0, rowsToImport.length);

  if (rowsToImport.length === 0) {
    return {
      imported: 0,
      skipped: skipDuplicateIndices.length,
      skippedUnpriceable: skippedUnpriceableCount,
      accountsCreated: 0,
      categoriesCreated: 0,
      tagsCreated: 0,
      payeesCreated: 0,
      errors: [],
      newTransactionIds: [],
      batchId,
    };
  }

  // Collect unique currencies from rows to import
  const uniqueCurrencies = new Set(rowsToImport.map((r) => r.currencyCode));

  // Add all currencies to user's currencies
  await addUserCurrencies(Array.from(uniqueCurrencies).map((code) => ({ userId, currencyCode: code })));

  // Create accounts that need to be created. Currency for a new account comes
  // from the first row that uses it; the fx reference date is "now" to preserve
  // the prior behavior.
  const uniqueAccountNames = Array.from(new Set(rowsToImport.map((r) => r.accountName)));
  const { accountNameToId } = await createAccountsIfNeeded({
    userId,
    accountNames: uniqueAccountNames,
    accountMapping,
    resolveCurrencyCode: (accountName) => rowsToImport.find((r) => r.accountName === accountName)?.currencyCode,
    resolveFxDate: () => new Date(),
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

  // Resolve Payees for every mapped merchant string up front. `payeesCreated`
  // counts only genuine inserts (a raw string matching an existing Payee by
  // canonical name or alias reuses it); the map is keyed by the verbatim source
  // string so each row looks its id up directly.
  const uniquePayeeNames = Array.from(
    new Set(rowsToImport.map((r) => r.payeeName).filter((name): name is string => !!name && name.trim().length > 0)),
  );
  const { payeeNameToId, payeesCreated } = await createPayeesIfNeeded({
    userId,
    payeeNames: uniquePayeeNames,
  });

  // Count created accounts
  let accountsCreated = 0;

  for (const [, mapping] of Object.entries(accountMapping)) {
    if (mapping.action === 'create-new') accountsCreated++;
  }

  // Create transactions
  const errors: ImportError[] = [];
  const newTransactionIds: string[] = [];

  let processedCount = 0;
  const tick = async () => {
    processedCount += 1;
    if (!onProgress) return;
    // Progress reporting is a best-effort side-effect (it fans out over SSE). A
    // failure here must never reject the import nor be attributed to a row, so
    // it is contained and logged rather than propagated. The count is already
    // advanced above, so a dropped tick does not desync the final total.
    try {
      await onProgress(processedCount, rowsToImport.length);
    } catch (err) {
      logger.error({ message: '[CSV import] Progress callback failed', error: err as Error });
    }
  };

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

      // A category from the mapped column is the user's explicit per-row choice
      // and beats a linked Payee's enforce/hint default (`categoryIdIsExplicit`
      // below). A row that only falls back to `defaultCategoryId` is NOT explicit,
      // so a Payee rule may still categorize it — hence the flag keys off
      // `mappedCategoryId`, not `categoryId`.
      const mappedCategoryId = row.categoryName ? categoryNameToId.get(row.categoryName) : undefined;
      const categoryId = mappedCategoryId ?? defaultCategoryId;

      // Payee resolved up front; passed explicitly so createTransaction links it
      // instead of re-extracting from `rawMerchantName`. `payeeLocked` stays at
      // its default — an import-assigned Payee stays user-overridable.
      const payeeId = row.payeeName ? payeeNameToId.get(row.payeeName) : undefined;

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
        payeeId: payeeId || undefined,
        tagIds: hasImportedTags ? rowTagIds : undefined,
        categoryIdIsExplicit: Boolean(mappedCategoryId),
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

        // Tick once per committed row, OUTSIDE the correctness path above: a
        // progress/SSE error must not be recorded as a fake per-row import
        // error against a row that did commit, nor abort the run.
        await tick();
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
    imported: newTransactionIds.length,
    skipped: skipDuplicateIndices.length,
    skippedUnpriceable: skippedUnpriceableCount,
    accountsCreated,
    categoriesCreated,
    tagsCreated,
    payeesCreated,
    errors,
    newTransactionIds,
    batchId,
  };
}

export const executeImport = executeImportImpl;
