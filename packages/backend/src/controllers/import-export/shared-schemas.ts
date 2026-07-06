import {
  AccountOptionValue,
  CategoryOptionValue,
  CurrencyOptionValue,
  TagOptionValue,
  TransactionTypeOptionValue,
} from '@bt/shared/types';
import { recordId } from '@common/lib/zod/custom-types';
import { z } from 'zod';

const categoryOptionSchema = z.discriminatedUnion('option', [
  z.object({ option: z.literal(CategoryOptionValue.mapDataSourceColumn), columnName: z.string() }),
  z.object({ option: z.literal(CategoryOptionValue.createNewCategories), columnName: z.string() }),
  z.object({ option: z.literal(CategoryOptionValue.existingCategory), categoryId: recordId() }),
]);

const tagOptionSchema = z.object({
  option: z.literal(TagOptionValue.mapDataSourceColumn),
  columnName: z.string(),
});

export const tagMappingValueSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create-new') }),
  z.object({ action: z.literal('link-existing'), tagId: recordId() }),
  z.object({ action: z.literal('skip') }),
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

export const columnMappingConfigSchema = z.object({
  date: z.string(),
  // Required: the wizard forces the user to confirm the day/month order of the
  // date column, so every payload carries an explicit choice.
  dateFieldOrder: z.enum(['day-first', 'month-first']),
  amount: z.string(),
  description: z.string().optional(),
  payee: z.string().optional(),
  category: categoryOptionSchema,
  tags: tagOptionSchema.nullish(),
  currency: currencyOptionSchema,
  transactionType: transactionTypeOptionSchema,
  account: accountOptionSchema,
});

export const accountMappingValueSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create-new') }),
  z.object({ action: z.literal('link-existing'), accountId: recordId() }),
]);

export const categoryMappingValueSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create-new') }),
  z.object({ action: z.literal('link-existing'), categoryId: recordId() }),
]);
