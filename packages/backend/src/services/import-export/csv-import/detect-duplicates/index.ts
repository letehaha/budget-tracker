import type {
  AccountMappingConfig,
  CategoryMappingConfig,
  ColumnMappingConfig,
  DetectDuplicatesResponse,
  InvalidRow,
  ParsedTransactionRow,
} from '@bt/shared/types';
import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  TransactionTypeOptionValue,
  asCents,
} from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import * as Accounts from '@models/accounts.model';
import { getUserSettings } from '@services/user-settings/get-user-settings';
import { parse } from 'csv-parse/sync';

import { MAX_CSV_ROWS } from '../csv-parser.service';
import { anchorImportDate } from './anchor-import-date';
import { detectDateColumnFormat, parseImportDate } from './date-engine';
import { findDuplicates } from './find-duplicates';
import { findUnpriceableRows } from './find-unpriceable-rows';
import { parseAmount } from './parse-amount';

interface DetectDuplicatesParams {
  userId: number;
  fileContent: string;
  delimiter: string;
  columnMapping: ColumnMappingConfig;
  accountMapping: AccountMappingConfig;
  categoryMapping: CategoryMappingConfig;
  /**
   * IANA timezone of the importing user's browser (e.g. `America/Montevideo`).
   * Anchors date-only and zone-less datetime cells to the correct calendar day.
   * Optional — absent/invalid values fall back to UTC anchoring.
   */
  timezone?: string;
}

/**
 * Validates and parses all rows from CSV, then detects duplicates
 */
export async function detectDuplicates({
  userId,
  fileContent,
  delimiter,
  columnMapping,
  accountMapping,
  timezone,
}: DetectDuplicatesParams): Promise<DetectDuplicatesResponse> {
  // Parse full CSV
  const records = parse(fileContent, {
    delimiter,
    skipEmptyLines: true,
    relaxColumnCount: true,
    trim: true,
    columns: false,
  }) as string[][];

  if (records.length === 0) {
    throw new ValidationError({ message: t({ key: 'csvImport.csvFileEmpty' }) });
  }

  const headers = records[0]!;
  const dataRows = records.slice(1);

  if (dataRows.length > MAX_CSV_ROWS) {
    throw new ValidationError({
      message: t({ key: 'csvImport.csvFileTooManyRows', variables: { max: MAX_CSV_ROWS } }),
    });
  }

  // Get column indices
  const dateIndex = headers.indexOf(columnMapping.date);
  const amountIndex = headers.indexOf(columnMapping.amount);
  const descriptionIndex = columnMapping.description ? headers.indexOf(columnMapping.description) : -1;
  const payeeIndex = columnMapping.payee ? headers.indexOf(columnMapping.payee) : -1;
  // A typo'd / case-mismatched `payee` mapping previously fell through as -1
  // here and silently ran the entire import with no payee data — the row
  // never picked up `rawMerchantName`, payee_rule never fired, and the user
  // saw "imported" without ever learning their mapped column was unreachable.
  // Fail validation upfront so the UI can surface the bad column.
  if (columnMapping.payee && payeeIndex === -1) {
    throw new ValidationError({
      message: t({ key: 'csvImport.payeeColumnNotFound', variables: { column: columnMapping.payee } }),
    });
  }
  const categoryIndex = getCategoryColumnIndex(headers, columnMapping);
  const accountIndex = getAccountColumnIndex(headers, columnMapping);
  const currencyIndex = getCurrencyColumnIndex(headers, columnMapping);
  const transactionTypeIndex = getTransactionTypeColumnIndex(headers, columnMapping);

  // Get default values for single-selection options
  const defaultCurrency = await getDefaultCurrency(userId, columnMapping);
  const defaultAccountId = await getDefaultAccountId(userId, columnMapping);

  // Resolve the date column's format ONCE from the whole column. The day/month
  // order of the ambiguous d/d/yyyy family is the user's, not US-by-default:
  // it's inferred from rows that disambiguate themselves, falling back to the
  // user's locale convention. `getUserSettings.locale` is `'en' | 'uk'`, a
  // subset of the engine's `SupportedLocale`.
  const { locale } = await getUserSettings({ userId });
  const dateColumnValues = dataRows.map((row) => row[dateIndex]?.trim() || '').filter((value) => value.length > 0);
  const dateFormatResult = detectDateColumnFormat({ values: dateColumnValues, locale });

  // Parse and validate each row
  const validRows: ParsedTransactionRow[] = [];
  const invalidRows: InvalidRow[] = [];

  // A column with contradicting day-first and month-first signals has no single
  // safe order. Surface it as a column-level error instead of silently splitting
  // rows across two months — the frontend renders this and blocks the import.
  if (!dateFormatResult.ok) {
    return {
      validRows,
      invalidRows,
      duplicates: [],
      dateColumnError: {
        column: columnMapping.date,
        reason: dateFormatResult.reason,
        message: t({ key: 'csvImport.mixedDateFormat', variables: { column: columnMapping.date } }),
      },
    };
  }

  const dateFormat = dateFormatResult.format;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowIndex = i + 2; // +2 because row 1 is headers, and we're 1-indexed
    const errors: string[] = [];

    // Parse date through the engine (timezone-agnostic), then anchor it to a
    // stored instant against the importing user's timezone. `null` means the
    // value matched no known shape — same loud invalid-row behaviour as before.
    const dateStr = row[dateIndex]?.trim() || '';
    const parsedDate = parseImportDate({ value: dateStr, format: dateFormat });
    if (!parsedDate) {
      errors.push(t({ key: 'csvImport.invalidDateFormat', variables: { dateStr } }));
    }

    // Parse amount
    const amountStr = row[amountIndex]?.trim() || '';
    const parsedAmount = parseAmount(amountStr);
    if (parsedAmount === null) {
      errors.push(t({ key: 'csvImport.invalidAmount', variables: { amountStr } }));
    }

    // Get description
    const description = descriptionIndex !== -1 ? row[descriptionIndex]?.trim() || '' : '';

    // Get Payee name (if mapped). Stored unconditionally — extraction
    // (Step 1 exact / Step 2 fuzzy / Step 3 promotion) is the same code path
    // bank-sync providers exercise via `rawMerchantName`.
    const payeeName = payeeIndex !== -1 ? row[payeeIndex]?.trim() || undefined : undefined;

    // Get category name (if from column)
    const categoryName = categoryIndex !== -1 ? row[categoryIndex]?.trim() || undefined : undefined;

    // Get account name (if from column) or use default
    let accountName = '';
    if (accountIndex !== -1) {
      accountName = row[accountIndex]?.trim() || '';
      if (!accountName) {
        errors.push(t({ key: 'csvImport.accountNameEmpty' }));
      }
    }

    // Get currency (if from column) or use default
    let currencyCode = defaultCurrency;
    if (currencyIndex !== -1) {
      currencyCode = row[currencyIndex]?.trim().toUpperCase() || '';
      if (!currencyCode) {
        errors.push(t({ key: 'csvImport.currencyCodeEmpty' }));
      }
    }

    // Determine transaction type
    let transactionType: 'income' | 'expense' = 'expense';
    if (columnMapping.transactionType.option === TransactionTypeOptionValue.amountSign) {
      transactionType = parsedAmount !== null && parsedAmount >= 0 ? 'income' : 'expense';
    } else if (transactionTypeIndex !== -1) {
      const typeValue = row[transactionTypeIndex]?.trim() || '';
      const typeOption = columnMapping.transactionType;
      if (typeOption.option === TransactionTypeOptionValue.dataSourceColumn) {
        if (typeOption.incomeValues.includes(typeValue)) {
          transactionType = 'income';
        } else if (typeOption.expenseValues.includes(typeValue)) {
          transactionType = 'expense';
        } else {
          errors.push(t({ key: 'csvImport.unknownTransactionType', variables: { typeValue } }));
        }
      }
    }

    if (errors.length > 0) {
      invalidRows.push({
        rowIndex,
        errors,
        rawData: headers.reduce(
          (acc, header, idx) => {
            acc[header] = row[idx] || '';
            return acc;
          },
          {} as Record<string, string>,
        ),
      });
    } else {
      // `row.date` carries the resolved absolute instant as an ISO string, so
      // `execute-import`'s `new Date(row.date)` reconstructs the exact moment.
      const instant = anchorImportDate({ parsed: parsedDate!, timezone });
      validRows.push({
        rowIndex,
        date: instant.toISOString(),
        amount: asCents(Math.abs(parsedAmount!)), // Store absolute value in cents, sign determined by transactionType
        description,
        payeeName,
        categoryName,
        accountName,
        currencyCode,
        transactionType,
      });
    }
  }

  // Build account name to ID mapping for duplicate detection
  const accountNameToId = await buildAccountNameToIdMapping(userId, validRows, accountMapping, defaultAccountId);

  // Find duplicates
  const duplicates = await findDuplicates({
    userId,
    validRows,
    accountNameToId,
  });

  // Identify rows whose currency has no stored exchange rate. The result is
  // passed to the preview so the user can decide to skip or abort those rows.
  const unpriceableRows = await findUnpriceableRows({ userId, validRows });

  return {
    validRows,
    invalidRows,
    duplicates,
    ...(unpriceableRows.length > 0 && { unpriceableRows }),
  };
}

function getCategoryColumnIndex(headers: string[], columnMapping: ColumnMappingConfig): number {
  const categoryOption = columnMapping.category;
  if (
    categoryOption.option === CategoryOptionValue.mapDataSourceColumn ||
    categoryOption.option === CategoryOptionValue.createNewCategories
  ) {
    return headers.indexOf(categoryOption.columnName);
  }
  return -1;
}

function getAccountColumnIndex(headers: string[], columnMapping: ColumnMappingConfig): number {
  const accountOption = columnMapping.account;
  if (accountOption.option === AccountOptionValue.dataSourceColumn) {
    return headers.indexOf(accountOption.columnName);
  }
  return -1;
}

function getCurrencyColumnIndex(headers: string[], columnMapping: ColumnMappingConfig): number {
  const currencyOption = columnMapping.currency;
  if (currencyOption.option === CurrencyOptionValue.dataSourceColumn) {
    return headers.indexOf(currencyOption.columnName);
  }
  return -1;
}

function getTransactionTypeColumnIndex(headers: string[], columnMapping: ColumnMappingConfig): number {
  const transactionTypeOption = columnMapping.transactionType;
  if (transactionTypeOption.option === TransactionTypeOptionValue.dataSourceColumn) {
    return headers.indexOf(transactionTypeOption.columnName);
  }
  return -1;
}

async function getDefaultCurrency(userId: number, columnMapping: ColumnMappingConfig): Promise<string> {
  const currencyOption = columnMapping.currency;
  if (currencyOption.option === CurrencyOptionValue.existingCurrency) {
    return currencyOption.currencyCode.toUpperCase();
  }

  // If using existing account, get currency from that account
  const accountOption = columnMapping.account;
  if (accountOption.option === AccountOptionValue.existingAccount) {
    const account = await Accounts.getAccountById({ userId, id: accountOption.accountId });
    if (account) {
      return account.currencyCode;
    }
  }

  return '';
}

async function getDefaultAccountId(userId: number, columnMapping: ColumnMappingConfig): Promise<string | null> {
  const accountOption = columnMapping.account;
  if (accountOption.option === AccountOptionValue.existingAccount) {
    const account = await Accounts.getAccountById({ userId, id: accountOption.accountId });
    return account?.id || null;
  }
  return null;
}

async function buildAccountNameToIdMapping(
  userId: number,
  validRows: ParsedTransactionRow[],
  accountMapping: AccountMappingConfig,
  defaultAccountId: string | null,
): Promise<Map<string, string | null>> {
  const mapping = new Map<string, string | null>();

  // If using single existing account, all rows map to that account
  if (defaultAccountId !== null) {
    const uniqueAccountNames = new Set(validRows.map((r) => r.accountName));
    for (const name of uniqueAccountNames) {
      mapping.set(name, defaultAccountId);
    }
    return mapping;
  }

  // Otherwise, use the account mapping from user
  for (const [accountName, mappingValue] of Object.entries(accountMapping)) {
    if (mappingValue.action === 'link-existing') {
      // Verify the account exists and belongs to user
      const account = await Accounts.getAccountById({ userId, id: mappingValue.accountId });
      mapping.set(accountName, account?.id || null);
    } else {
      // create-new: account doesn't exist yet, will be created during import
      mapping.set(accountName, null);
    }
  }

  return mapping;
}
