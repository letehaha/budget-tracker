/**
 * Reads a Microsoft Money (.mny) database into the importer's parse result.
 *
 * Money keeps its ledger in a handful of tables:
 *   ACCT       accounts
 *   TRN        every transaction row, including split lines
 *   TRN_SPLIT  links split lines to their parent row
 *   TRN_XFER   links the two legs of a transfer
 *   CAT        two-level categories under fixed INCOME/EXPENSE roots
 *   PAY        payees
 *   CRNC       currencies
 *
 * Three of those relationships decide what actually gets imported:
 *
 *  - A split is stored as a parent row holding the total plus child rows holding
 *    the per-category detail. The parent carries no category, so the children are
 *    imported as individual transactions and the parent is dropped — importing
 *    both would double the amount.
 *  - A transfer is stored as two mirrored rows, joined by TRN_XFER. Only one
 *    transfer is emitted per pair; importing each row on its own would double
 *    every transfer.
 *  - A voided row keeps its amount but sets bit 21 of `grftt`. Those are skipped.
 */
import {
  MS_MONEY_MAX_ROWS,
  MS_MONEY_SUPPORTED_ACCOUNT_TYPES,
  type MsMoneyAccountType,
  type MsMoneyParseAccount,
  type MsMoneyParseCategory,
  type MsMoneyParsePayee,
  type MsMoneyParseResult,
  type MsMoneyParseTransaction,
  type MsMoneyParseTransfer,
  type MsMoneyParseWarning,
  TRANSACTION_TYPES,
} from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import MDBReader from 'mdb-reader';

import { decryptMsisam } from './decrypt-msisam';

/** Bit 21 of `TRN.grftt` marks a row voided in Money. */
const VOID_FLAG = 0x200000;

/** Money writes -1 rather than null for "no payee". */
const NO_PAYEE = -1;

/** `TRN.cs` — Money's cleared state. 2 means reconciled against a statement. */
const CLEARED_STATE_RECONCILED = 2;

interface AcctRow {
  hacct: number;
  szFull: string | null;
  at: number | null;
  hcrnc: number | null;
}
interface TrnRow {
  htrn: number;
  hacct: number | null;
  /** Counterpart account when the row is one leg of a transfer. */
  hacctLink: number | null;
  dt: Date | null;
  amt: string | number | null;
  hcat: number | null;
  lHpay: number | null;
  mMemo: string | null;
  szId: string | null;
  cs: number | null;
  grftt: number | null;
}
interface CatRow {
  hcat: number;
  szFull: string | null;
  hcatParent: number | null;
  nLevel: number | null;
}

/** Money stores amounts in a fixed-point currency column; the reader hands them
 *  back as decimal strings to avoid float drift. */
function toDecimal({ value }: { value: string | number | null | undefined }): number {
  if (value == null) return 0;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Money dates are plain calendar days; anchor them to UTC midnight. */
function toIsoDate({ value }: { value: Date | null | undefined }): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

function readTable<T>({ reader, name, columns }: { reader: MDBReader; name: string; columns?: string[] }): T[] {
  if (!reader.getTableNames().includes(name)) return [];
  const table = reader.getTable(name);
  const available = new Set(table.getColumnNames());
  const wanted = columns?.filter((column) => available.has(column));
  return table.getData({ ...(wanted?.length ? { columns: wanted } : {}) }) as T[];
}

/**
 * Builds each category's display path. Money nests categories two deep beneath
 * fixed INCOME and EXPENSE roots, so a leaf renders as `"Group:Leaf"` while a
 * group renders as its own name. The roots themselves are structural and are
 * never offered as categories.
 */
function buildCategoryIndex({ rows }: { rows: CatRow[] }) {
  const byId = new Map(rows.map((row) => [row.hcat, row]));
  const index = new Map<number, { fullName: string; name: string; groupName: string | null }>();

  for (const row of rows) {
    const name = row.szFull?.trim();
    // Level 0 holds the INCOME/EXPENSE roots — structural, never user-facing.
    if (!name || row.nLevel === 0) continue;

    const parent = row.hcatParent == null ? undefined : byId.get(row.hcatParent);
    const groupName = parent && parent.nLevel !== 0 ? (parent.szFull?.trim() ?? null) : null;

    index.set(row.hcat, {
      fullName: groupName ? `${groupName}:${name}` : name,
      name,
      groupName,
    });
  }

  return index;
}

export function parseMsMoneyFile({
  buffer,
  password = null,
}: {
  buffer: Buffer;
  password?: string | null;
}): MsMoneyParseResult {
  const { buffer: plaintext, encryption } = decryptMsisam({ buffer, password });

  let reader: MDBReader;
  try {
    reader = new MDBReader(plaintext);
  } catch (err) {
    throw new ValidationError({
      message: `This Microsoft Money file could not be read — it may be damaged or saved by an unsupported version. (${
        err instanceof Error ? err.message : 'unknown error'
      })`,
    });
  }

  // Without these two the parser would return an empty result and no warnings,
  // walking the user through a wizard that imports nothing.
  const tableNames = new Set(reader.getTableNames());
  if (!tableNames.has('ACCT') || !tableNames.has('TRN')) {
    throw new ValidationError({
      message:
        'This Microsoft Money file is missing the account or transaction tables — it may be damaged or saved by an unsupported version.',
    });
  }

  const warnings: MsMoneyParseWarning[] = [];
  const addWarning = ({ code, message, count }: MsMoneyParseWarning) => {
    if (count > 0) warnings.push({ code, message, count });
  };

  // --- currencies -----------------------------------------------------------
  const currencyById = new Map<number, string>();
  for (const row of readTable<{ hcrnc: number; szIsoCode: string | null }>({
    reader,
    name: 'CRNC',
    columns: ['hcrnc', 'szIsoCode'],
  })) {
    const code = row.szIsoCode?.trim().toUpperCase();
    if (code) currencyById.set(row.hcrnc, code);
  }

  // --- accounts -------------------------------------------------------------
  const supported = new Set<number>(MS_MONEY_SUPPORTED_ACCOUNT_TYPES);
  const accountById = new Map<number, MsMoneyParseAccount>();
  /** Every id in ACCT, so a transaction pointing at a missing account can be
   *  told apart from one on an account this importer skipped. */
  const knownAcctIds = new Set<number>();
  let unsupportedAccounts = 0;
  let defaultedCurrencies = 0;

  for (const row of readTable<AcctRow>({ reader, name: 'ACCT', columns: ['hacct', 'szFull', 'at', 'hcrnc'] })) {
    knownAcctIds.add(row.hacct);

    const name = row.szFull?.trim();
    if (!name) continue;

    if (row.at == null || !supported.has(row.at)) {
      unsupportedAccounts += 1;
      continue;
    }

    const currency = (row.hcrnc == null ? undefined : currencyById.get(row.hcrnc)) ?? null;
    if (!currency) defaultedCurrencies += 1;

    accountById.set(row.hacct, {
      originalName: name,
      currency: currency ?? 'USD',
      accountType: row.at as MsMoneyAccountType,
      transactionCount: 0,
      netImportedAmount: 0,
    });
  }

  addWarning({
    code: 'account-type-unsupported',
    message:
      'Investment and loan accounts were skipped. Investments belong to portfolios, and loans use a dedicated flow that does not accept imported transactions.',
    count: unsupportedAccounts,
  });
  addWarning({
    code: 'account-currency-defaulted',
    message:
      'Some accounts carry no currency this file could resolve, so they are imported as US dollars. Change their currency after the import if that is wrong.',
    count: defaultedCurrencies,
  });

  // --- lookups --------------------------------------------------------------
  const categoryIndex = buildCategoryIndex({
    rows: readTable<CatRow>({ reader, name: 'CAT', columns: ['hcat', 'szFull', 'hcatParent', 'nLevel'] }),
  });

  const payeeById = new Map<number, string>();
  for (const row of readTable<{ hpay: number; szFull: string | null }>({
    reader,
    name: 'PAY',
    columns: ['hpay', 'szFull'],
  })) {
    const name = row.szFull?.trim();
    if (name) payeeById.set(row.hpay, name);
  }

  // Split children are imported individually; their parents only hold the total.
  const splitParentIds = new Set<number>();
  const splitChildIds = new Set<number>();
  for (const row of readTable<{ htrn: number | null; htrnParent: number | null }>({
    reader,
    name: 'TRN_SPLIT',
    columns: ['htrn', 'htrnParent'],
  })) {
    if (row.htrnParent != null) splitParentIds.add(row.htrnParent);
    if (row.htrn != null) splitChildIds.add(row.htrn);
  }

  // --- transactions ---------------------------------------------------------
  const trnRows = readTable<TrnRow>({
    reader,
    name: 'TRN',
    columns: ['htrn', 'hacct', 'hacctLink', 'dt', 'amt', 'hcat', 'lHpay', 'mMemo', 'szId', 'cs', 'grftt'],
  });
  const trnById = new Map(trnRows.map((row) => [row.htrn, row]));

  let voidRows = 0;
  let orphanRows = 0;

  /** Rows that survive filtering and are eligible to become transactions. */
  const eligible: TrnRow[] = [];
  for (const row of trnRows) {
    if (splitParentIds.has(row.htrn)) continue;
    if ((row.grftt ?? 0) & VOID_FLAG) {
      voidRows += 1;
      continue;
    }
    if (row.hacct == null || !accountById.has(row.hacct)) {
      // A row on an account this importer skipped is already covered by the
      // account-type warning, so only a reference ACCT cannot resolve is an orphan.
      if (row.hacct == null || !knownAcctIds.has(row.hacct)) orphanRows += 1;
      continue;
    }
    eligible.push(row);
  }

  addWarning({
    code: 'void-row-skipped',
    message: 'Transactions marked void in Microsoft Money were skipped.',
    count: voidRows,
  });
  addWarning({
    code: 'orphan-row-skipped',
    message: 'Some transactions referenced an account that no longer exists in the file and were skipped.',
    count: orphanRows,
  });

  const eligibleIds = new Set(eligible.map((row) => row.htrn));

  // --- emitted rows ---------------------------------------------------------
  // Transfers and transactions draw on one shared row budget, so a file made
  // mostly of transfers cannot spend the whole allowance before the transaction
  // loop starts.
  const transactions: MsMoneyParseTransaction[] = [];
  const transfers: MsMoneyParseTransfer[] = [];
  const categoryCounts = new Map<string, number>();
  const payeeCounts = new Map<string, number>();
  let droppedForRowLimit = 0;
  let datelessRows = 0;
  const rowBudgetLeft = () => transactions.length + transfers.length < MS_MONEY_MAX_ROWS;

  // --- transfers ------------------------------------------------------------
  // Money links the two legs explicitly, so no amount/date matching is needed.
  const consumedByTransfer = new Set<number>();
  const rowIndexById = new Map<number, number>();
  let nextRowIndex = 0;
  const claimRowIndex = (htrn: number) => {
    const existing = rowIndexById.get(htrn);
    if (existing !== undefined) return existing;
    const index = nextRowIndex++;
    rowIndexById.set(htrn, index);
    return index;
  };

  for (const link of readTable<{ htrnFrom: number | null; htrnLink: number | null }>({
    reader,
    name: 'TRN_XFER',
    columns: ['htrnFrom', 'htrnLink'],
  })) {
    if (link.htrnFrom == null || link.htrnLink == null) continue;

    const first = trnById.get(link.htrnFrom);
    const second = trnById.get(link.htrnLink);
    if (!first || !second) continue;

    const firstEligible = eligibleIds.has(first.htrn);
    const secondEligible = eligibleIds.has(second.htrn);

    // When only one side is being imported the pair cannot become a transfer;
    // the surviving leg falls through to the transaction loop, which imports it
    // as money leaving/entering the tracked accounts.
    if (!firstEligible || !secondEligible) continue;

    // The leg with the negative amount is the source; Money always signs the
    // two legs opposite to each other.
    const firstAmount = toDecimal({ value: first.amt });
    const [source, destination] = firstAmount <= 0 ? [first, second] : [second, first];

    const sourceAccount = accountById.get(source.hacct!)!;
    const destinationAccount = accountById.get(destination.hacct!)!;
    const date = toIsoDate({ value: source.dt }) ?? toIsoDate({ value: destination.dt });

    // Claimed before the drop checks below, so a pair this loop gives up on is
    // never re-counted as two loose rows by the transaction loop.
    consumedByTransfer.add(source.htrn);
    consumedByTransfer.add(destination.htrn);

    if (!date) {
      datelessRows += 1;
      continue;
    }
    if (!rowBudgetLeft()) {
      droppedForRowLimit += 1;
      continue;
    }

    const payeeId = source.lHpay ?? destination.lHpay;
    const payeeName = payeeId != null && payeeId !== NO_PAYEE ? (payeeById.get(payeeId) ?? null) : null;

    transfers.push({
      sourceAccountName: sourceAccount.originalName,
      destinationAccountName: destinationAccount.originalName,
      date,
      sourceAmount: Math.abs(toDecimal({ value: source.amt })),
      destinationAmount: Math.abs(toDecimal({ value: destination.amt })),
      sourceCurrency: sourceAccount.currency,
      destinationCurrency: destinationAccount.currency,
      note: source.mMemo?.trim() || destination.mMemo?.trim() || '',
      payeeName,
      rowIndices: [claimRowIndex(source.htrn), claimRowIndex(destination.htrn)],
      sourceIds: [source.htrn, destination.htrn],
    });

    if (payeeName) payeeCounts.set(payeeName, (payeeCounts.get(payeeName) ?? 0) + 1);

    sourceAccount.transactionCount += 1;
    sourceAccount.netImportedAmount -= Math.abs(toDecimal({ value: source.amt }));
    destinationAccount.transactionCount += 1;
    destinationAccount.netImportedAmount += Math.abs(toDecimal({ value: destination.amt }));
  }

  // --- remaining rows become transactions -----------------------------------
  for (const row of eligible) {
    if (consumedByTransfer.has(row.htrn)) continue;

    if (!rowBudgetLeft()) {
      droppedForRowLimit += 1;
      continue;
    }

    const date = toIsoDate({ value: row.dt });
    if (!date) {
      datelessRows += 1;
      continue;
    }

    const account = accountById.get(row.hacct!)!;
    const amount = toDecimal({ value: row.amt });
    const category = row.hcat == null ? undefined : categoryIndex.get(row.hcat);
    const payeeName = row.lHpay != null && row.lHpay !== NO_PAYEE ? (payeeById.get(row.lHpay) ?? null) : null;

    // Rows paired into a transfer were skipped above, so a counterpart account
    // still set here means the other side is not part of this import.
    const outOfWallet = row.hacctLink != null;

    transactions.push({
      rowIndex: claimRowIndex(row.htrn),
      sourceId: row.htrn,
      date,
      accountName: account.originalName,
      categoryName: outOfWallet ? null : (category?.fullName ?? null),
      payeeName,
      note: row.mMemo?.trim() ?? '',
      amount,
      // A zero-amount row carries no sign to read, so it lands on the income side.
      type: amount < 0 ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
      referenceNumber: row.szId?.trim() || null,
      reconciled: row.cs === CLEARED_STATE_RECONCILED,
      outOfWallet,
      fromSplit: splitChildIds.has(row.htrn),
    });

    account.transactionCount += 1;
    account.netImportedAmount += amount;

    if (!outOfWallet && category) {
      categoryCounts.set(category.fullName, (categoryCounts.get(category.fullName) ?? 0) + 1);
    }
    if (payeeName) payeeCounts.set(payeeName, (payeeCounts.get(payeeName) ?? 0) + 1);
  }

  // Counted from the rows that were actually emitted, so the number the user
  // reads always matches the transactions in the preview.
  addWarning({
    code: 'transfer-counterpart-not-imported',
    message:
      'Some transfers moved money to an account that is not part of this import. Those rows are imported as transfers out of your tracked accounts.',
    count: transactions.filter((transaction) => transaction.outOfWallet).length,
  });

  addWarning({
    code: 'row-limit-reached',
    message: `This file holds more than ${MS_MONEY_MAX_ROWS.toLocaleString('en-US')} transactions. The excess rows were not imported.`,
    count: droppedForRowLimit,
  });

  addWarning({
    code: 'row-missing-date',
    message: 'Some rows had no readable date and were skipped.',
    count: datelessRows,
  });

  // --- aggregates -----------------------------------------------------------
  const categories: MsMoneyParseCategory[] = [];
  for (const entry of categoryIndex.values()) {
    const transactionCount = categoryCounts.get(entry.fullName);
    if (transactionCount) categories.push({ ...entry, transactionCount });
  }
  categories.sort((a, b) => a.fullName.localeCompare(b.fullName));

  const payees: MsMoneyParsePayee[] = [...payeeCounts.entries()]
    .map(([name, transactionCount]) => ({ name, transactionCount }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const accounts = [...accountById.values()]
    .filter((account) => account.transactionCount > 0)
    .sort((a, b) => a.originalName.localeCompare(b.originalName));

  const allDates = [...transactions.map((tx) => tx.date), ...transfers.map((transfer) => transfer.date)].sort();
  const dateRange = allDates.length ? { from: allDates[0]!, to: allDates[allDates.length - 1]! } : null;

  // Money has no single "base currency" field, so the most-used account
  // currency stands in for it. Never used for maths.
  const currencyUse = new Map<string, number>();
  for (const account of accounts) {
    currencyUse.set(account.currency, (currencyUse.get(account.currency) ?? 0) + account.transactionCount);
  }
  const baseCurrency = [...currencyUse.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    accounts,
    categories,
    payees,
    transactions,
    transfers,
    warnings,
    dateRange,
    baseCurrency,
    encryption,
  };
}
