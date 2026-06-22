import {
  TRANSACTION_TYPES,
  WALLET_CSV_DELIMITER,
  WALLET_MAX_ROWS,
  WALLET_TRANSFER_CATEGORY,
  type WalletParseAccount,
  type WalletParseCategory,
  type WalletParseResult,
  type WalletParseTag,
  type WalletParseTransaction,
  type WalletParseTransfer,
  type WalletParseWarning,
} from '@bt/shared/types';
import { ValidationError } from '@js/errors';
import { parse } from 'csv-parse/sync';

import { roundCurrency } from '../round-currency';
import { parseWalletAmount } from './parse-amount';
import { parseWalletDate } from './parse-date';

/** Headers the Wallet CSV must contain (case-sensitive — Wallet's export is stable). */
const REQUIRED_HEADERS = [
  'account',
  'category',
  'currency',
  'amount',
  'ref_currency_amount',
  'type',
  'payment_type',
  'note',
  'date',
  'transfer',
  'payee',
  'labels',
] as const;

/** Internal representation of a fully-parsed CSV row before classification. */
interface ParsedLeg {
  rowIndex: number;
  accountName: string;
  currency: string;
  /** Always positive — sign applied separately via `type`. */
  amount: number;
  /** Ref-currency amount used only for transfer-pairing tolerance check. */
  refCurrencyAmount: number;
  /** `Expense` → negative signedAmount; `Income` → positive. */
  type: 'Expense' | 'Income';
  signedAmount: number;
  paymentType: string;
  note: string;
  /** Normalized ISO instant string. */
  date: string;
  /** Whether this row is a transfer leg (`transfer` column === 'true'). */
  isTransfer: boolean;
  tag: string | null;
  category: string | null;
}

/**
 * Top-level entry point. Takes the verbatim contents of a Wallet (BudgetBakers)
 * CSV export and produces the structured preview the wizard renders.
 *
 * Pure function: no DB writes, no side effects. Safe to call twice (the execute
 * worker re-parses rather than persisting an intermediate session state).
 */
export function parseWalletCsv({ fileContent }: { fileContent: string }): WalletParseResult {
  if (typeof fileContent !== 'string' || fileContent.trim() === '') {
    throw new ValidationError({ message: 'Wallet CSV is empty.' });
  }

  let records: Record<string, string>[];
  try {
    records = parse(fileContent, {
      columns: true,
      delimiter: WALLET_CSV_DELIMITER,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw new ValidationError({
      message: `Wallet CSV could not be parsed: ${err instanceof Error ? err.message : 'unknown error'}`,
    });
  }

  if (records.length === 0) {
    throw new ValidationError({ message: 'Wallet CSV contains no transactions.' });
  }

  if (records.length > WALLET_MAX_ROWS) {
    throw new ValidationError({
      message: `Wallet CSV has ${records.length} rows; max supported is ${WALLET_MAX_ROWS}.`,
    });
  }

  const firstRow = records[0]!;
  const missing = REQUIRED_HEADERS.filter((h) => !(h in firstRow));
  if (missing.length > 0) {
    throw new ValidationError({
      message: `Wallet CSV is missing required column(s): ${missing.join(', ')}. The export format may have changed.`,
    });
  }

  const warnings: WalletParseWarning[] = [];
  const parsedLegs: ParsedLeg[] = [];

  records.forEach((record, idx) => {
    // Human-visible row number: header = line 1, first data row = line 2.
    const rowIndex = idx + 2;

    const accountName = (record['account'] ?? '').trim();
    if (!accountName) {
      warnings.push({ rowIndex, code: 'row-skipped', message: 'Row has no account; skipped.' });
      return;
    }

    const rawDate = record['date'] ?? '';
    const date = parseWalletDate({ raw: rawDate });
    if (!date) {
      warnings.push({
        rowIndex,
        code: 'unparseable-date',
        message: `Could not parse date "${rawDate}"; row skipped.`,
      });
      return;
    }

    const rawAmount = record['amount'] ?? '';
    const amount = parseWalletAmount({ raw: rawAmount });
    if (amount === null) {
      warnings.push({
        rowIndex,
        code: 'unparseable-amount',
        message: `Could not parse amount "${rawAmount}"; row skipped.`,
      });
      return;
    }

    const rawRef = record['ref_currency_amount'] ?? '';
    const refCurrencyAmount = parseWalletAmount({ raw: rawRef });
    if (refCurrencyAmount === null) {
      warnings.push({
        rowIndex,
        code: 'unparseable-amount',
        message: `Could not parse ref_currency_amount "${rawRef}"; row skipped.`,
      });
      return;
    }

    const type = (record['type'] ?? '').trim() as 'Expense' | 'Income';
    if (type !== 'Expense' && type !== 'Income') {
      warnings.push({
        rowIndex,
        code: 'row-skipped',
        message: `Unknown type "${type}"; row skipped.`,
      });
      return;
    }

    // Wallet stores amounts as positive; sign is determined solely by `type`.
    // The zero guard prevents IEEE-754 negative zero (-0) when `amount` is 0:
    // `-1 * 0 === -0`, which fails strict-equality checks against +0.
    const signed = type === 'Expense' ? -amount : amount;
    const signedAmount = roundCurrency({ n: signed === 0 ? 0 : signed });

    const currency = (record['currency'] ?? '').trim();
    const paymentType = (record['payment_type'] ?? '').trim();
    const note = (record['note'] ?? '').trim();
    const isTransfer = (record['transfer'] ?? '').trim() === 'true';
    const rawLabels = (record['labels'] ?? '').trim();
    const tag = rawLabels || null;
    const rawCategory = (record['category'] ?? '').trim();
    // The transfer-marker string is never a real category; store null for it
    // so downstream code never sees it as a category name.
    const category = rawCategory && rawCategory !== WALLET_TRANSFER_CATEGORY ? rawCategory : null;

    parsedLegs.push({
      rowIndex,
      accountName,
      currency,
      amount,
      refCurrencyAmount,
      type,
      signedAmount,
      paymentType,
      note,
      date,
      isTransfer,
      tag,
      category,
    });
  });

  if (parsedLegs.length === 0) {
    throw new ValidationError({
      message: 'No usable rows found in Wallet CSV (all rows were skipped or unparseable).',
    });
  }

  const ordinaryLegs = parsedLegs.filter((l) => !l.isTransfer);
  const transferLegs = parsedLegs.filter((l) => l.isTransfer);

  const { transfers, pairedRowIndices } = pairTransfers({ legs: transferLegs, warnings });

  // Unpaired transfer legs become out-of-wallet transactions — still imported,
  // just flagged so the execute step knows to use `transfer_out_wallet` nature.
  const outOfWalletLegs = transferLegs.filter((l) => !pairedRowIndices.has(l.rowIndex));

  const transactions: WalletParseTransaction[] = [
    ...ordinaryLegs.map(
      (l): WalletParseTransaction => ({
        rowIndex: l.rowIndex,
        date: l.date,
        accountName: l.accountName,
        categoryName: l.category,
        note: l.note,
        amount: l.signedAmount,
        type: l.type === 'Expense' ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
        paymentType: l.paymentType,
        tag: l.tag,
        outOfWallet: false,
      }),
    ),
    ...outOfWalletLegs.map(
      (l): WalletParseTransaction => ({
        rowIndex: l.rowIndex,
        date: l.date,
        accountName: l.accountName,
        categoryName: null,
        note: l.note,
        amount: l.signedAmount,
        type: l.type === 'Expense' ? TRANSACTION_TYPES.expense : TRANSACTION_TYPES.income,
        paymentType: l.paymentType,
        tag: l.tag,
        outOfWallet: true,
      }),
    ),
  ];

  const accounts = collectAccounts({ legs: parsedLegs });
  const categories = collectCategories({ legs: ordinaryLegs });
  // Only legs that become tag-bearing transactions count toward the tag list:
  // ordinary rows and unpaired (out-of-wallet) legs carry their label through to
  // a created transaction, but a paired transfer collapses into a WalletParseTransfer
  // that has no tag, so its label would be created and counted yet attached to
  // nothing. Excluding paired transfer legs keeps `tagsCreated` honest.
  const tags = collectTags({ legs: [...ordinaryLegs, ...outOfWalletLegs] });
  const dateRange = computeDateRange({ legs: parsedLegs });
  const detectedBaseCurrency = detectBaseCurrency({ legs: parsedLegs });

  return {
    accounts,
    categories,
    tags,
    transactions,
    transfers,
    warnings,
    dateRange,
    detectedBaseCurrency,
  };
}

/**
 * Match transfer legs into pairs using the spec algorithm:
 *  1. Group legs by exact normalized date string (Wallet guarantees paired legs
 *     share an identical timestamp).
 *  2. Within each group, match each Expense leg to the best unused Income leg
 *     with a different account and ref_currency_amount within 1% relative
 *     tolerance. Prefer the smallest delta (exact match first).
 *  3. Leftover legs are returned as warnings; caller promotes them to
 *     out-of-wallet transactions.
 */
function pairTransfers({ legs, warnings }: { legs: ParsedLeg[]; warnings: WalletParseWarning[] }): {
  transfers: WalletParseTransfer[];
  pairedRowIndices: Set<number>;
} {
  const transfers: WalletParseTransfer[] = [];
  const pairedRowIndices = new Set<number>();

  // Group all transfer legs by their exact ISO instant string.
  const byDate = new Map<string, ParsedLeg[]>();
  for (const leg of legs) {
    const bucket = byDate.get(leg.date) ?? [];
    bucket.push(leg);
    byDate.set(leg.date, bucket);
  }

  for (const [date, group] of byDate) {
    const expenses = group.filter((l) => l.type === 'Expense');
    const incomes = group.filter((l) => l.type === 'Income');

    // Track which income legs are still available within this date group.
    const usedIncomeRows = new Set<number>();

    for (const expense of expenses) {
      // Collect all candidate incomes: different account, ref amounts within 1%.
      const candidates = incomes.filter((income) => {
        if (usedIncomeRows.has(income.rowIndex)) return false;
        if (income.accountName === expense.accountName) return false;
        const maxRef = Math.max(expense.refCurrencyAmount, income.refCurrencyAmount);
        if (maxRef === 0) return expense.refCurrencyAmount === income.refCurrencyAmount;
        const relDelta = Math.abs(expense.refCurrencyAmount - income.refCurrencyAmount) / maxRef;
        return relDelta <= 0.01;
      });

      if (candidates.length === 0) continue;

      // Prefer the income whose ref_currency_amount is closest to the expense's.
      // Exact match (delta 0) wins; ties broken by stable iteration order.
      const best = candidates.reduce((prev, curr) => {
        const prevDelta = Math.abs(prev.refCurrencyAmount - expense.refCurrencyAmount);
        const currDelta = Math.abs(curr.refCurrencyAmount - expense.refCurrencyAmount);
        return currDelta < prevDelta ? curr : prev;
      });

      pairedRowIndices.add(expense.rowIndex);
      usedIncomeRows.add(best.rowIndex);
      pairedRowIndices.add(best.rowIndex);

      transfers.push({
        sourceAccountName: expense.accountName,
        destinationAccountName: best.accountName,
        date,
        // Both amounts are stored positive; the execute step applies the
        // correct sign when creating each transaction leg.
        sourceAmount: expense.amount,
        destinationAmount: best.amount,
        sourceCurrency: expense.currency,
        destinationCurrency: best.currency,
        note: expense.note || best.note,
        rowIndices: [expense.rowIndex, best.rowIndex],
      });
    }

    // Unpaired expense legs.
    for (const expense of expenses) {
      if (pairedRowIndices.has(expense.rowIndex)) continue;
      warnings.push({
        rowIndex: expense.rowIndex,
        code: 'transfer-counterpart-missing',
        message: `Transfer expense from "${expense.accountName}" at ${date} has no matching income leg; imported as out-of-wallet transfer.`,
      });
    }

    // Unpaired income legs.
    for (const income of incomes) {
      if (pairedRowIndices.has(income.rowIndex)) continue;
      warnings.push({
        rowIndex: income.rowIndex,
        code: 'transfer-counterpart-missing',
        message: `Transfer income to "${income.accountName}" at ${date} has no matching expense leg; imported as out-of-wallet transfer.`,
      });
    }
  }

  return { transfers, pairedRowIndices };
}

function collectAccounts({ legs }: { legs: ParsedLeg[] }): WalletParseAccount[] {
  const byName = new Map<string, { currency: string; transactionCount: number; netImportedAmount: number }>();

  for (const leg of legs) {
    const existing = byName.get(leg.accountName) ?? {
      // First row for this account wins for currency — Wallet guarantees single
      // currency per account so all rows agree.
      currency: leg.currency,
      transactionCount: 0,
      netImportedAmount: 0,
    };
    existing.transactionCount += 1;
    existing.netImportedAmount = roundCurrency({ n: existing.netImportedAmount + leg.signedAmount });
    byName.set(leg.accountName, existing);
  }

  return Array.from(byName.entries()).map(([originalName, agg]) => ({
    originalName,
    currency: agg.currency,
    transactionCount: agg.transactionCount,
    netImportedAmount: agg.netImportedAmount,
  }));
}

function collectCategories({ legs }: { legs: ParsedLeg[] }): WalletParseCategory[] {
  const byName = new Map<string, number>();

  for (const leg of legs) {
    // category is already null for transfer-marker rows and empty cells.
    if (!leg.category) continue;
    byName.set(leg.category, (byName.get(leg.category) ?? 0) + 1);
  }

  return Array.from(byName.entries())
    .map(([name, transactionCount]) => ({ name, transactionCount }))
    .toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function collectTags({ legs }: { legs: ParsedLeg[] }): WalletParseTag[] {
  const byName = new Map<string, number>();

  for (const leg of legs) {
    if (!leg.tag) continue;
    byName.set(leg.tag, (byName.get(leg.tag) ?? 0) + 1);
  }

  return Array.from(byName.entries())
    .map(([name, transactionCount]) => ({ name, transactionCount }))
    .toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function computeDateRange({ legs }: { legs: ParsedLeg[] }): { from: string; to: string } | null {
  let min: string | null = null;
  let max: string | null = null;
  for (const leg of legs) {
    if (min === null || leg.date < min) min = leg.date;
    if (max === null || leg.date > max) max = leg.date;
  }
  if (!min || !max) return null;
  return { from: min, to: max };
}

/**
 * Infer the export's reference currency from rows where `amount` equals
 * `ref_currency_amount`. When amounts match, the account's own currency is
 * also the base currency the user configured in Wallet. Informational only —
 * the execute step does not use this value; it recomputes refAmount via
 * FX-by-date from the app's own base currency.
 */
function detectBaseCurrency({ legs }: { legs: ParsedLeg[] }): string | null {
  for (const leg of legs) {
    if (leg.amount === leg.refCurrencyAmount && leg.currency) {
      return leg.currency;
    }
  }
  return null;
}
