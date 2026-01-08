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
} from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import * as Accounts from '@models/Accounts.model';
import { parse } from 'csv-parse/sync';

import { findDuplicates } from './find-duplicates';
import { parseAmount } from './parse-amount';
import { parseDate } from './parse-date';

interface DetectDuplicatesParams {
  userId: number;
  fileContent: string;
  delimiter: string;
  columnMapping: ColumnMappingConfig;
  accountMapping: AccountMappingConfig;
  categoryMapping: CategoryMappingConfig;
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

  // Get column indices
  const dateIndex = headers.indexOf(columnMapping.date);
  const amountIndex = headers.indexOf(columnMapping.amount);
  const descriptionIndex = columnMapping.description ? headers.indexOf(columnMapping.description) : -1;
  const categoryIndex = getCategoryColumnIndex(headers, columnMapping);
  const accountIndex = getAccountColumnIndex(headers, columnMapping);
  const currencyIndex = getCurrencyColumnIndex(headers, columnMapping);
  const transactionTypeIndex = getTransactionTypeColumnIndex(headers, columnMapping);

  // Get default values for single-selection options
  const defaultCurrency = await getDefaultCurrency(userId, columnMapping);
  const defaultAccountId = await getDefaultAccountId(userId, columnMapping);

  // Parse and validate each row
  const validRows: ParsedTransactionRow[] = [];
  const invalidRows: InvalidRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const rowIndex = i + 2; // +2 because row 1 is headers, and we're 1-indexed
    const errors: string[] = [];

    // Parse date
    const dateStr = row[dateIndex]?.trim() || '';
    const parsedDate = parseDate(dateStr);
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
      validRows.push({
        rowIndex,
        date: parsedDate!,
        amount: Math.abs(parsedAmount!), // Store absolute value, sign determined by transactionType
        description,
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

  return {
    validRows,
    invalidRows,
    duplicates,
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

async function getDefaultAccountId(userId: number, columnMapping: ColumnMappingConfig): Promise<number | null> {
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
  defaultAccountId: number | null,
): Promise<Map<string, number | null>> {
  const mapping = new Map<string, number | null>();

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
