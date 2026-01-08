import type { ColumnMappingConfig, ExtractUniqueValuesResponse } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { parse } from 'csv-parse/sync';

import { extractAccounts } from './extract-accounts';
import { extractCategories } from './extract-categories';
import { validateBasicFields } from './validate-basic-fields';
import { validateCurrency } from './validate-currency';
import { validateExistingAccount } from './validate-existing-account';
import { validateExistingCategory } from './validate-existing-category';
import { validateTransactionType } from './validate-transaction-type';

interface ExtractUniqueValuesParams {
  userId: number;
  fileContent: string;
  delimiter: string;
  columnMapping: ColumnMappingConfig;
}

/**
 * Extracts unique values from the full CSV dataset based on column mapping.
 * Also validates that any existing entities (account, category, currency) exist and belong to user.
 */
export async function extractUniqueValues({
  userId,
  fileContent,
  delimiter,
  columnMapping,
}: ExtractUniqueValuesParams): Promise<ExtractUniqueValuesResponse> {
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

  const headers = records[0];

  if (!headers) {
    throw new ValidationError({ message: t({ key: 'csvImport.headersCannotBeParsed' }) });
  }

  const dataRows = records.slice(1);

  validateBasicFields({ headers, columnMapping });

  // Validate currency and get currency info for account extraction
  const { currencyColumnIndex, defaultCurrency, currencyMismatchWarning } = await validateCurrency({
    userId,
    headers,
    dataRows,
    columnMapping,
  });

  validateTransactionType({ headers, dataRows, columnMapping });

  // Validate existing account if selected
  await validateExistingAccount({ userId, columnMapping });

  // Validate existing category if selected
  await validateExistingCategory({ userId, columnMapping });

  // Extract accounts from CSV (only if using data-source-column option)
  const { sourceAccounts } = extractAccounts(
    headers,
    dataRows,
    columnMapping.account,
    currencyColumnIndex,
    defaultCurrency,
  );

  // Extract categories from CSV (only if using map-data-source-column or create-new-categories)
  const sourceCategories = extractCategories({ headers, dataRows, columnMapping });

  return {
    sourceAccounts,
    sourceCategories,
    currencyMismatchWarning,
  };
}
