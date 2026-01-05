import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import Categories from '@models/Categories.model';

import {
  MAX_SPLITS_PER_TRANSACTION,
  MAX_SPLIT_NOTE_LENGTH,
  MIN_SPLIT_AMOUNT,
  SPLIT_ERROR_CODES,
  SplitInput,
  SplitValidationError,
} from './types';

interface ValidateSplitsParams {
  splits: SplitInput[];
  transactionAmount: number;
  userId: number;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
}

/**
 * Validates split data for a transaction.
 * Returns an array of validation errors (empty if valid).
 */
export const validateSplits = async ({
  splits,
  transactionAmount,
  userId,
  transferNature,
}: ValidateSplitsParams): Promise<SplitValidationError[]> => {
  const errors: SplitValidationError[] = [];

  // Check if trying to add splits to a transfer transaction
  if (transferNature && transferNature !== TRANSACTION_TRANSFER_NATURE.not_transfer) {
    errors.push({
      field: 'splits',
      message: 'Cannot add splits to transfer transactions',
      code: SPLIT_ERROR_CODES.SPLITS_ON_TRANSFER,
    });
    return errors; // Return early, no point validating further
  }

  // Check split count limit
  if (splits.length > MAX_SPLITS_PER_TRANSACTION) {
    errors.push({
      field: 'splits',
      message: `Maximum ${MAX_SPLITS_PER_TRANSACTION} splits allowed per transaction`,
      code: SPLIT_ERROR_CODES.SPLIT_LIMIT_EXCEEDED,
    });
  }

  // Validate each split
  const categoryIds = new Set<number>();

  for (let i = 0; i < splits.length; i++) {
    const split = splits[i]!;
    const fieldPrefix = `splits[${i}]`;

    // Check required fields
    if (split.categoryId === undefined || split.categoryId === null) {
      errors.push({
        field: `${fieldPrefix}.categoryId`,
        message: 'Category is required for each split',
        code: SPLIT_ERROR_CODES.SPLIT_MISSING_CATEGORY,
      });
    } else {
      categoryIds.add(split.categoryId);
    }

    if (split.amount === undefined || split.amount === null) {
      errors.push({
        field: `${fieldPrefix}.amount`,
        message: 'Amount is required for each split',
        code: SPLIT_ERROR_CODES.SPLIT_MISSING_AMOUNT,
      });
    } else {
      // Check for negative amounts
      if (split.amount < 0) {
        errors.push({
          field: `${fieldPrefix}.amount`,
          message: 'Split amount cannot be negative',
          code: SPLIT_ERROR_CODES.SPLIT_AMOUNT_NEGATIVE,
        });
      }
      // Check minimum amount
      else if (split.amount < MIN_SPLIT_AMOUNT) {
        errors.push({
          field: `${fieldPrefix}.amount`,
          message: `Split amount must be at least ${MIN_SPLIT_AMOUNT / 100} (system minimum)`,
          code: SPLIT_ERROR_CODES.SPLIT_AMOUNT_TOO_SMALL,
        });
      }
    }

    // Check note length
    if (split.note && split.note.length > MAX_SPLIT_NOTE_LENGTH) {
      errors.push({
        field: `${fieldPrefix}.note`,
        message: `Split note cannot exceed ${MAX_SPLIT_NOTE_LENGTH} characters`,
        code: SPLIT_ERROR_CODES.SPLIT_NOTE_TOO_LONG,
      });
    }
  }

  // Validate that all categories exist and belong to user
  if (categoryIds.size > 0) {
    const existingCategories = await Categories.findAll({
      where: {
        id: Array.from(categoryIds),
        userId,
      },
      attributes: ['id'],
    });

    const existingCategoryIds = new Set(existingCategories.map((c) => c.id));

    for (let i = 0; i < splits.length; i++) {
      const split = splits[i]!;
      if (split.categoryId && !existingCategoryIds.has(split.categoryId)) {
        errors.push({
          field: `splits[${i}].categoryId`,
          message: `Category with id ${split.categoryId} not found or does not belong to user`,
          code: SPLIT_ERROR_CODES.SPLIT_INVALID_CATEGORY,
        });
      }
    }
  }

  // Check that total splits don't exceed transaction amount
  const totalSplitAmount = splits.reduce((sum, split) => sum + (split.amount || 0), 0);
  if (totalSplitAmount > transactionAmount) {
    errors.push({
      field: 'splits',
      message: `Total split amount (${totalSplitAmount}) exceeds transaction amount (${transactionAmount})`,
      code: SPLIT_ERROR_CODES.SPLITS_EXCEED_TOTAL,
    });
  }

  return errors;
};

/**
 * Throws a ValidationError if splits are invalid.
 * Used for request validation before processing.
 */
export const assertValidSplits = async (params: ValidateSplitsParams): Promise<void> => {
  const errors = await validateSplits(params);

  if (errors.length > 0) {
    const { ValidationError } = await import('@js/errors');
    throw new ValidationError({
      message: 'Invalid split data',
      // @ts-expect-error - extending error with additional data
      errors,
    });
  }
};
