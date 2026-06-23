import {
  ACCOUNT_TYPES,
  type BudgetBakersWalletAccountMapping,
  type BudgetBakersWalletImportSummary,
  type CategoryMappingConfig,
  ImportSource,
  PAYMENT_TYPES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  type TransactionImportDetails,
} from '@bt/shared/types';
import { pickRandomColor } from '@common/lib/random-color';
import { Money } from '@common/types/money';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as Accounts from '@models/accounts.model';
import { updateAccount } from '@services/accounts.service';
import { addUserCurrencies } from '@services/currencies/add-user-currency';
import { createAccountsIfNeeded } from '@services/import-export/core/resolve/create-accounts-if-needed';
import { createCategoriesIfNeeded } from '@services/import-export/core/resolve/create-categories-if-needed';
import { createNamedTagsIfNeeded } from '@services/import-export/core/resolve/create-tags-if-needed';
import { createTransaction } from '@services/transactions';
import { v4 as uuidv4 } from 'uuid';

import { mapBudgetBakersWalletPaymentType } from './localized-values';
import { parseBudgetBakersWalletCsv } from './parse-budget-bakers-wallet.service';

interface ExecuteBudgetBakersWalletImportParams {
  userId: number;
  fileContent: string;
  accountMapping: BudgetBakersWalletAccountMapping;
  /** Per-category decision keyed by the verbatim Wallet `category` value. Drives
   *  link-existing-vs-create resolution (see `createCategoriesIfNeeded`). The
   *  transfer-marker category is never present here, and parsed categories absent
   *  from this map import without a category rather than being silently created. */
  categoryMapping: CategoryMappingConfig;
  /** Row indices the user confirmed as duplicates against linked accounts. Those
   *  transactions are counted as `duplicatesSkipped` and never written. */
  skipDuplicateIndices: number[];
  /** Called with cumulative `processedCount` after each committed row so the
   *  BullMQ worker can fan progress out over SSE. Optional — safe to omit in
   *  tests or one-shot callers. */
  onProgress?: (processedCount: number, totalCount: number) => void | Promise<void>;
}

/**
 * One-shot writer for a parsed Wallet (BudgetBakers) CSV export. Runs OUTSIDE a
 * wrapping transaction so a single bad row does not nuke the whole import —
 * partial success is the contract documented for the user. Each helper (account
 * / category / tag creation, individual transaction insert, balance targeting)
 * still runs inside its own `withTransaction` further down the call stack.
 *
 * Balance model: `currentBalance = initialBalance + Σ(transactions)`. New
 * accounts are created with a zero initial balance and every imported row is
 * applied; linked accounts already carry their real balance. After all rows are
 * written, each account that has a target balance is back-adjusted via
 * `updateAccount` (which moves `initialBalance`/`refInitialBalance` without
 * spawning an adjustment transaction). The result: a new account shows exactly
 * the balance the user entered, and a linked account keeps its pre-import
 * balance regardless of how many rows landed (skipped duplicates fall out for
 * free).
 */
export async function executeBudgetBakersWalletImport({
  userId,
  fileContent,
  accountMapping,
  categoryMapping,
  skipDuplicateIndices,
  onProgress,
}: ExecuteBudgetBakersWalletImportParams): Promise<BudgetBakersWalletImportSummary> {
  const parsed = parseBudgetBakersWalletCsv({ fileContent });

  // Validate every distinct account name in the parser output has a mapping.
  const missingMappings = parsed.accounts.filter((a) => !accountMapping[a.originalName]);
  if (missingMappings.length > 0) {
    throw new ValidationError({
      message: `Missing account mapping for: ${missingMappings.map((a) => a.originalName).join(', ')}`,
    });
  }

  const importDetails: TransactionImportDetails = {
    batchId: uuidv4(),
    importedAt: new Date().toISOString(),
    source: ImportSource.budgetBakersWallet,
  };

  const summary: BudgetBakersWalletImportSummary = {
    accountsCreated: 0,
    accountsLinked: 0,
    categoriesCreated: 0,
    tagsCreated: 0,
    transactionsImported: 0,
    transfersImported: 0,
    outOfWalletImported: 0,
    duplicatesSkipped: 0,
    errors: [],
  };

  const skipSet = new Set(skipDuplicateIndices);

  // Progress total counts only rows that will actually be written: transactions
  // not flagged as duplicates, plus every paired transfer. Skipped rows never
  // tick, so the worker's `processedCount === totalCount` completion check holds.
  const transactionsToWrite = parsed.transactions.filter((tx) => !skipSet.has(tx.rowIndex));
  const totalCount = transactionsToWrite.length + parsed.transfers.length;

  // Report the real total once up front. The per-row `tick` is the only other
  // caller of `onProgress`, so an import that writes no rows would otherwise
  // never surface its total and the worker would report `totalCount: 0`.
  if (onProgress) await onProgress(0, totalCount);

  // Convert new-account starting balances at the earliest CSV date, not today —
  // Wallet exports span years and today's FX rate would skew refInitialBalance.
  // Fall back to today when the parser found no usable dates at all.
  const initialBalanceFxDate = parsed.dateRange ? new Date(parsed.dateRange.from) : new Date();

  // Phase 1: bootstrap currencies for every account that will be created. Linked
  // accounts already have their currency connected (it's an existing account).
  const currencyCodes = new Set<string>();
  for (const account of parsed.accounts) {
    const mapping = accountMapping[account.originalName]!;
    if (mapping.action === 'create-new') currencyCodes.add(mapping.currencyCode);
  }
  if (currencyCodes.size > 0) {
    await addUserCurrencies(Array.from(currencyCodes).map((currencyCode) => ({ userId, currencyCode })));
  }

  // Phase 2: accounts. Two concerns the shared resolver does not cover are
  // handled here first, before any rows are written: Wallet's link-existing
  // currency match (a UAH CSV account cannot post to a USD app account) and the
  // per-account target current balance restored in Phase 7. This loop validates
  // every link-existing mapping (ownership + currency) with Wallet-specific
  // messages, captures each account's balance target, and tallies
  // `accountsLinked`; the actual id resolution and new-account creation is then
  // delegated to `createAccountsIfNeeded`.
  const targetCurrentBalanceByName = new Map<string, number>();
  for (const account of parsed.accounts) {
    const mapping = accountMapping[account.originalName]!;

    if (mapping.action === 'create-new') {
      if (mapping.currentBalance != null) {
        targetCurrentBalanceByName.set(account.originalName, mapping.currentBalance);
      }
    } else {
      const existing = await Accounts.getAccountById({ userId, id: mapping.accountId });
      if (!existing) {
        throw new ValidationError({
          message: `Account "${account.originalName}" is linked to an account that does not exist or is not yours.`,
        });
      }
      if (existing.currencyCode !== account.currency) {
        throw new ValidationError({
          message: `Account "${account.originalName}" (${account.currency}) cannot be linked to "${existing.name}" (${existing.currencyCode}) — currencies must match.`,
        });
      }
      // Preserve the account's balance as it stands today: capture it now and
      // restore it in Phase 7 after the imported rows have moved it.
      targetCurrentBalanceByName.set(account.originalName, existing.currentBalance.toNumber());
      summary.accountsLinked += 1;
    }
  }

  // Resolve every parsed account to an app account id, creating new ones with a
  // zero starting balance (the imported rows build the balance up; the
  // user-entered target is restored in Phase 7). New-account currency comes from
  // the user-confirmed mapping; the fx reference date is the earliest CSV date.
  // `alwaysCreate` stays false because Wallet supports both link-existing and
  // create-new. `accountsCreated` counts only genuine inserts.
  const { accountNameToId: accountIdByName, accountsCreated } = await createAccountsIfNeeded({
    userId,
    accountNames: parsed.accounts.map((account) => account.originalName),
    accountMapping,
    resolveCurrencyCode: (accountName) => {
      const mapping = accountMapping[accountName];
      return mapping?.action === 'create-new' ? mapping.currencyCode : undefined;
    },
    resolveFxDate: () => initialBalanceFxDate,
  });
  summary.accountsCreated = accountsCreated;

  // Phase 3: categories. Resolve each mapped category to an id via the shared
  // CSV resolver: link-existing verifies ownership, create-new finds-or-creates
  // by name (case-insensitive), and `categoriesCreated` counts only genuine
  // inserts. The transfer-marker category never appears in the mapping, so it is
  // never resolved nor created. Parsed categories the user left out of the
  // mapping resolve to nothing (`categoryNameToId.get` is undefined for them),
  // so those rows import without a category rather than being silently created.
  const { categoryNameToId, categoriesCreated } = await createCategoriesIfNeeded({ userId, categoryMapping });
  summary.categoriesCreated = categoriesCreated;

  // Phase 4: tags. Find-or-create each verbatim Wallet label, picking a random
  // colour per requested name for the create case. The shared helper batches the
  // existing-lookup and is fail-fast: a failing tag insert aborts the whole
  // import rather than being swallowed into `summary.errors`.
  const { tagIdByName, tagsCreated } = await createNamedTagsIfNeeded({
    userId,
    tags: parsed.tags.map((tag) => ({ name: tag.name, color: pickRandomColor() })),
  });
  summary.tagsCreated = tagsCreated;

  let processedCount = 0;
  const tick = async () => {
    processedCount += 1;
    if (!onProgress) return;
    // Progress reporting is a best-effort side-effect (it fans out over SSE). A
    // failure here must never reject the import or be attributed to a row, so it
    // is contained and logged rather than propagated. The count is already
    // advanced above, so a dropped tick does not desync the final total.
    try {
      await onProgress(processedCount, totalCount);
    } catch (err) {
      logger.error({ message: '[Budget Bakers Wallet import] Progress callback failed', error: err as Error });
    }
  };

  // Phase 5: transactions (ordinary rows + unpaired transfer legs). Rows the
  // user confirmed as duplicates are counted and skipped without a tick.
  for (const tx of parsed.transactions) {
    if (skipSet.has(tx.rowIndex)) {
      summary.duplicatesSkipped += 1;
      continue;
    }
    try {
      const accountId = accountIdByName.get(tx.accountName);
      if (!accountId) throw new ValidationError({ message: `Unknown account "${tx.accountName}"` });

      // Direction comes from the parsed CSV `type`, not the sign of `amount`:
      // a zero-amount row has no sign (`-0 === 0`) yet still has a real
      // Expense/Income type the user expects to keep.
      const transactionType = tx.type;
      const amount = Money.fromDecimal(Math.abs(tx.amount));

      // Out-of-wallet legs carry no real category and model money leaving/entering
      // the tracked set of accounts, so they import as `transfer_out_wallet` with
      // no destination account and no category. Ordinary rows resolve their
      // category through the mapping; an unmapped name yields undefined (no
      // category), matching CSV behaviour.
      const categoryId = !tx.outOfWallet && tx.categoryName ? categoryNameToId.get(tx.categoryName) : undefined;
      const tagId = tx.tag ? tagIdByName.get(tx.tag) : undefined;
      const tagIds = tagId ? [tagId] : undefined;
      const transferNature = tx.outOfWallet
        ? TRANSACTION_TRANSFER_NATURE.transfer_out_wallet
        : TRANSACTION_TRANSFER_NATURE.not_transfer;

      await createTransaction({
        userId,
        accountId,
        amount,
        commissionRate: Money.zero(),
        note: tx.note,
        time: new Date(tx.date),
        transactionType,
        paymentType: mapBudgetBakersWalletPaymentType({ raw: tx.paymentType }),
        accountType: ACCOUNT_TYPES.system,
        transferNature,
        categoryId,
        tagIds,
        externalData: { importDetails },
      });

      if (tx.outOfWallet) {
        summary.outOfWalletImported += 1;
      } else {
        summary.transactionsImported += 1;
      }
    } catch (err) {
      logger.error({
        message: `[Budget Bakers Wallet import] Failed to import transaction (row ${tx.rowIndex}, account "${tx.accountName}")`,
        error: err as Error,
      });
      summary.errors.push({
        rowIndex: tx.rowIndex,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    // Tick once per attempted row, regardless of success or failure, and OUTSIDE
    // the correctness try/catch: a progress/SSE error must not be recorded as a
    // fake per-row import error against a row that did commit, nor abort the run.
    await tick();
  }

  // Phase 6: transfers. A Wallet export records the exact amount on each side of
  // a transfer, so a cross-currency transfer carries a distinct source amount and
  // destination amount (e.g. 100 USD leaving, 92 EUR arriving). Both values are
  // passed straight through: `createTransaction` with `common_transfer` writes
  // the source (expense) and destination (income) legs and links them via
  // `transferId`.
  for (const xfer of parsed.transfers) {
    try {
      const sourceAccountId = accountIdByName.get(xfer.sourceAccountName);
      const destinationAccountId = accountIdByName.get(xfer.destinationAccountName);
      if (!sourceAccountId || !destinationAccountId) {
        throw new ValidationError({
          message: `Transfer references unknown account ("${xfer.sourceAccountName}" or "${xfer.destinationAccountName}").`,
        });
      }

      await createTransaction({
        userId,
        accountId: sourceAccountId,
        amount: Money.fromDecimal(xfer.sourceAmount),
        commissionRate: Money.zero(),
        note: xfer.note,
        time: new Date(xfer.date),
        transactionType: TRANSACTION_TYPES.expense,
        paymentType: PAYMENT_TYPES.bankTransfer,
        accountType: ACCOUNT_TYPES.system,
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAccountId,
        destinationAmount: Money.fromDecimal(xfer.destinationAmount),
        externalData: { importDetails },
      });

      summary.transfersImported += 1;
    } catch (err) {
      logger.error({
        message: `[Budget Bakers Wallet import] Failed to import transfer ("${xfer.sourceAccountName}" → "${xfer.destinationAccountName}", rows ${xfer.rowIndices.join(', ')})`,
        error: err as Error,
      });
      const message = err instanceof Error ? err.message : 'Unknown error';
      // One error per leg so a user scanning by CSV line number can find both
      // halves of the failed transfer, not just the expense leg.
      for (const rowIndex of xfer.rowIndices) {
        summary.errors.push({ rowIndex, error: message });
      }
    }
    // Tick once per attempted transfer, regardless of success or failure, and
    // OUTSIDE the correctness try/catch: a progress/SSE error must not be
    // recorded as a fake import error nor abort the run.
    await tick();
  }

  // Phase 7: balance targeting. Must run AFTER all rows are written so the
  // back-adjustment is computed against the current balance the imported
  // transactions produced. Setting `currentBalance` makes `updateAccount`
  // move `initialBalance`/`refInitialBalance` by the diff (no adjustment
  // transaction), so new accounts show the entered balance and linked accounts
  // are restored to their pre-import balance.
  for (const [accountName, target] of targetCurrentBalanceByName) {
    const accountId = accountIdByName.get(accountName)!;
    const isLinkExisting = accountMapping[accountName]?.action === 'link-existing';
    try {
      await updateAccount({ id: accountId, userId, currentBalance: Money.fromDecimal(target) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (isLinkExisting) {
        // The imported rows shifted a pre-existing account's balance and the reset
        // back to its captured pre-import value failed. The transactions are
        // committed, so this is a data-correctness problem the user must see and
        // fix manually, not a routine row error — surface it with a distinct code
        // the done step renders as a destructive callout.
        logger.error({
          message: `[Budget Bakers Wallet import] Failed to reset balance for linked account "${accountName}" after import — balance may be incorrect`,
          error: err as Error,
        });
        summary.errors.push({
          rowIndex: null,
          code: 'account-balance-desync',
          error: `${accountName}: balance could not be reset after import; this account balance may be incorrect`,
        });
      } else {
        logger.error({
          message: `[Budget Bakers Wallet import] Failed to set balance for account "${accountName}"`,
          error: err as Error,
        });
        // Account-level failure — no single CSV row maps to it, so rowIndex is null.
        summary.errors.push({ rowIndex: null, error: `Failed to set balance for "${accountName}": ${message}` });
      }
    }
  }

  return summary;
}
