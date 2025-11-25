import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { detectDuplicates } from '@services/import-export/csv-import/detect-duplicates';
import { z } from 'zod';

const categoryOptionSchema = z.discriminatedUnion('option', [
  z.object({ option: z.literal(CategoryOptionValue.mapDataSourceColumn), columnName: z.string() }),
  z.object({ option: z.literal(CategoryOptionValue.createNewCategories), columnName: z.string() }),
  z.object({ option: z.literal(CategoryOptionValue.existingCategory), categoryId: z.number() }),
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
  z.object({ option: z.literal(AccountOptionValue.existingAccount), accountId: z.number() }),
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
  z.object({ action: z.literal('link-existing'), accountId: z.number() }),
]);

const categoryMappingValueSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create-new') }),
  z.object({ action: z.literal('link-existing'), categoryId: z.number() }),
]);

export const detectDuplicatesController = createController(
  z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
      delimiter: z.string().min(1, 'Delimiter is required'),
      columnMapping: columnMappingConfigSchema,
      accountMapping: z.record(z.string(), accountMappingValueSchema),
      categoryMapping: z.record(z.string(), categoryMappingValueSchema),
    }),
  }),
  async ({ user, body }) => {
    const { fileContent, delimiter, columnMapping, accountMapping, categoryMapping } = body;

    const result = await detectDuplicates({
      userId: user.id,
      fileContent,
      delimiter,
      columnMapping,
      accountMapping,
      categoryMapping,
    });

    return {
      data: result,
    };
  },
);
