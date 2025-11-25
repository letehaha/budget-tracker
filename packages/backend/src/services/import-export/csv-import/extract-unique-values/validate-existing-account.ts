import { AccountOptionValue, type ColumnMappingConfig } from '@bt/shared/types';
import { NotFoundError } from '@js/errors';
import * as Accounts from '@models/Accounts.model';

interface ValidateExistingAccountParams {
  userId: number;
  columnMapping: ColumnMappingConfig;
}

/**
 * Validates that the selected existing account belongs to the user
 */
export async function validateExistingAccount({ userId, columnMapping }: ValidateExistingAccountParams): Promise<void> {
  const accountOption = columnMapping.account;

  if (accountOption.option === AccountOptionValue.existingAccount) {
    const account = await Accounts.getAccountById({
      userId,
      id: accountOption.accountId,
    });

    if (!account) {
      throw new NotFoundError({
        message: `Account with ID ${accountOption.accountId} not found or does not belong to you.`,
      });
    }
  }
}
