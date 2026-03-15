import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { t } from '@i18n/index';
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
  transactionAmount: Money;
  userId: number;
  transferNature?: TRANSACTION_TRANSFER_NATURE;
}

/**
 * Validates split data for a transaction.
 * Returns an array of validation errors (empty if valid).
 */
const validateSplits = async ({
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
      message: t({ key: 'transactions.splits.splitsOnTransfer' }),
      code: SPLIT_ERROR_CODES.SPLITS_ON_TRANSFER,
    });
    return errors; // Return early, no point validating further
  }

  // Check split count limit
  if (splits.length > MAX_SPLITS_PER_TRANSACTION) {
    errors.push({
      field: 'splits',
      message: t({ key: 'transactions.splits.splitLimitExceeded', variables: { max: MAX_SPLITS_PER_TRANSACTION } }),
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
        message: t({ key: 'transactions.splits.missingCategory' }),
        code: SPLIT_ERROR_CODES.SPLIT_MISSING_CATEGORY,
      });
    } else {
      categoryIds.add(split.categoryId);
    }

    if (split.amount === undefined || split.amount === null) {
      errors.push({
        field: `${fieldPrefix}.amount`,
        message: t({ key: 'transactions.splits.missingAmount' }),
        code: SPLIT_ERROR_CODES.SPLIT_MISSING_AMOUNT,
      });
    } else {
      // Check for negative amounts
      if (split.amount.isNegative()) {
        errors.push({
          field: `${fieldPrefix}.amount`,
          message: t({ key: 'transactions.splits.amountNegative' }),
          code: SPLIT_ERROR_CODES.SPLIT_AMOUNT_NEGATIVE,
        });
      }
      // Check minimum amount
      else if (split.amount.lessThan(MIN_SPLIT_AMOUNT)) {
        errors.push({
          field: `${fieldPrefix}.amount`,
          message: t({ key: 'transactions.splits.amountTooSmall', variables: { min: MIN_SPLIT_AMOUNT.toNumber() } }),
          code: SPLIT_ERROR_CODES.SPLIT_AMOUNT_TOO_SMALL,
        });
      }
    }

    // Check note length
    if (split.note && split.note.length > MAX_SPLIT_NOTE_LENGTH) {
      errors.push({
        field: `${fieldPrefix}.note`,
        message: t({ key: 'transactions.splits.noteTooLong', variables: { max: MAX_SPLIT_NOTE_LENGTH } }),
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
          message: t({ key: 'transactions.splits.invalidCategory', variables: { categoryId: split.categoryId } }),
          code: SPLIT_ERROR_CODES.SPLIT_INVALID_CATEGORY,
        });
      }
    }
  }

  // Check that total splits don't exceed transaction amount
  const totalSplitAmount = Money.sum(splits.map((split) => split.amount || Money.zero()));
  if (totalSplitAmount.greaterThan(transactionAmount)) {
    errors.push({
      field: 'splits',
      message: t({
        key: 'transactions.splits.exceedTotal',
        variables: { total: totalSplitAmount.toNumber(), transactionAmount: transactionAmount.toNumber() },
      }),
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
      message: t({ key: 'transactions.splits.invalidData' }),
      // @ts-expect-error - extending error with additional data
      errors,
    });
  }
};
