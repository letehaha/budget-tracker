import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { createController } from '@controllers/helpers/controller-factory';
import { detectDuplicates } from '@services/import-export/csv-import/detect-duplicates';
import { z } from 'zod';

const categoryOptionSchema = z.discriminatedUnion('option', [
  z.object({ option: z.literal(CategoryOptionValue.mapDataSourceColumn), columnName: z.string() }),
  z.object({ option: z.literal(CategoryOptionValue.createNewCategories), columnName: z.string() }),
  z.object({ option: z.literal(CategoryOptionValue.existingCategory), categoryId: recordId() }),
]);

const currencyOptionSchema = z.discriminatedUnion('option', [
  z.object({ option: z.literal(CurrencyOptionValue.dataSourceColumn), columnName: z.string() }),
  z.object({ option: z.literal(CurrencyOptionValue.existingCurrency), currencyCode: z.string() }),
]);

const transactionTypeOptionSchema = z.discriminatedUnion('option', [
  z.object({
    option: z.literal(TransactionTypeOptionValue.dataSourceColumn),
    columnName: z.string(),
    incomeValues: z.array(z.string()),
    expenseValues: z.array(z.string()),
  }),
  z.object({ option: z.literal(TransactionTypeOptionValue.amountSign) }),
]);

const accountOptionSchema = z.discriminatedUnion('option', [
  z.object({ option: z.literal(AccountOptionValue.dataSourceColumn), columnName: z.string() }),
  z.object({ option: z.literal(AccountOptionValue.existingAccount), accountId: recordId() }),
]);

const columnMappingConfigSchema = z.object({
  date: z.string(),
  amount: z.string(),
  description: z.string().optional(),
  category: categoryOptionSchema,
  currency: currencyOptionSchema,
  transactionType: transactionTypeOptionSchema,
  account: accountOptionSchema,
});

const accountMappingValueSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create-new') }),
  z.object({ action: z.literal('link-existing'), accountId: recordId() }),
]);

const categoryMappingValueSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create-new') }),
  z.object({ action: z.literal('link-existing'), categoryId: recordId() }),
]);

export const detectDuplicatesController = createController(
  z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
      delimiter: z.string().min(1, 'Delimiter is required'),
      columnMapping: columnMappingConfigSchema,
      accountMapping: z.record(z.string(), accountMappingValueSchema),
      categoryMapping: z.record(z.string(), categoryMappingValueSchema),
      // IANA timezone of the importing user's browser. Validation stays loose (any
      // non-empty string): the service tolerates an unknown zone by falling back
      // to UTC anchoring rather than rejecting the whole import.
      timezone: z.string().min(1).optional(),
    }),
  }),
  async ({ user, body }) => {
    const { fileContent, delimiter, columnMapping, accountMapping, categoryMapping, timezone } = body;

    const result = await detectDuplicates({
      userId: user.id,
      fileContent,
      delimiter,
      columnMapping,
      accountMapping,
      categoryMapping,
      timezone,
    });

    return {
      data: result,
    };
  },
);
