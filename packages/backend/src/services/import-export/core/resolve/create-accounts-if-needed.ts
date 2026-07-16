import type { AccountMappingConfig } from '@bt/shared/types';
import { ACCOUNT_CATEGORIES, ACCOUNT_TYPES } from '@bt/shared/types';
import { Money } from '@common/types/money';
import { ValidationError } from '@js/errors';
import * as Accounts from '@models/accounts.model';
import { calculateRefAmount } from '@services/calculate-ref-amount.service';
import { assertNotDedicatedFlowAccount } from '@services/import-export/core/dedicated-flow-guard';

interface CreateAccountsIfNeededParams {
  userId: number;
  /** Distinct source account names to ensure an account exists for. */
  accountNames: string[];
  accountMapping: AccountMappingConfig;
  /**
   * Currency code to use when creating a new account for `accountName`. CSV
   * passes the currency of the first row that uses the account. Returning
   * undefined for a name that needs a new account throws a ValidationError.
   */
  resolveCurrencyCode: (accountName: string) => string | undefined;
  /** Date used as the fx reference point when computing the ref initial balance. */
  resolveFxDate: (accountName: string) => Date;
  /** Initial balance in cents for a newly created account. Defaults to 0. */
  resolveInitialBalanceCents?: (accountName: string) => number;
  /**
   * When true, every name is created as a new account regardless of mapping.
   * Defaults to false, which preserves the link-existing / create-new /
   * default-fallback resolution driven by `accountMapping`.
   */
  alwaysCreate?: boolean;
  /**
   * Fallback account id used when a name has no entry in `accountMapping`. CSV
   * passes this for the "single existing account" flow where every row's
   * account name is empty and per-name mapping is absent.
   */
  defaultAccountId?: string;
}

interface CreateAccountsIfNeededResult {
  /** Resolved account id per distinct source account name. */
  accountNameToId: Map<string, string>;
  /** Number of accounts actually inserted. Linked/fallback accounts don't count. */
  accountsCreated: number;
}

/**
 * Resolve each distinct source account name to an account id, creating accounts
 * where the user chose `create-new` (or for every name when `alwaysCreate`).
 *
 * - missing mapping: when `defaultAccountId` is provided, verify it belongs to
 *   the user and map the name to it; otherwise throw.
 * - `link-existing`: verify the mapped account id belongs to the user, then map.
 * - `create-new`: derive the currency via `resolveCurrencyCode`, compute the ref
 *   initial balance via `calculateRefAmount`, and insert a general/system account
 *   with zero balance and zero credit limit.
 *
 * Provider-specific bits (currency, fx date, initial balance, the
 * always-create flag, the default fallback) are injected so other importers can
 * reuse this without copying the resolution logic.
 */
export async function createAccountsIfNeeded({
  userId,
  accountNames,
  accountMapping,
  resolveCurrencyCode,
  resolveFxDate,
  resolveInitialBalanceCents,
  alwaysCreate = false,
  defaultAccountId,
}: CreateAccountsIfNeededParams): Promise<CreateAccountsIfNeededResult> {
  const accountNameToId = new Map<string, string>();
  let accountsCreated = 0;

  const uniqueAccountNames = new Set(accountNames);

  const createNewAccount = async (accountName: string) => {
    const currencyCode = resolveCurrencyCode(accountName);

    if (!currencyCode) {
      throw new ValidationError({
        message: `Cannot determine currency for new account "${accountName}"`,
      });
    }

    const initialBalanceCents = resolveInitialBalanceCents?.(accountName) ?? 0;
    const initialBalance = initialBalanceCents === 0 ? Money.zero() : Money.fromCents(initialBalanceCents);

    const refInitialBalance = await calculateRefAmount({
      userId,
      amount: initialBalance,
      baseCode: currencyCode,
      date: resolveFxDate(accountName),
    });

    const newAccount = await Accounts.createAccount({
      userId,
      name: accountName,
      currencyCode,
      accountCategory: ACCOUNT_CATEGORIES.general,
      type: ACCOUNT_TYPES.system,
      initialBalance,
      refInitialBalance,
      creditLimit: Money.zero(),
      refCreditLimit: Money.zero(),
    });

    // `Accounts.createAccount` reads the row back via `getAccountById`, whose
    // return is nullable — a falsy result means the insert did not land. Abort the
    // whole import with an actionable cause rather than leaving the name unmapped,
    // which would surface as a flood of misleading per-row "account could not be
    // resolved" errors that never reveal account creation was what failed. Mirrors
    // the fail-fast in `createCategoriesIfNeeded`.
    if (!newAccount) {
      throw new ValidationError({ message: `Failed to create account "${accountName}".` });
    }
    accountNameToId.set(accountName, newAccount.id);
    accountsCreated += 1;
  };

  // Verify an existing account id belongs to the user and is an eligible import
  // target, returning it or throwing. Shared by the `defaultAccountId` fallback
  // and the `link-existing` branch, which resolve the same way off a different id.
  const resolveExistingAccount = async (id: string) => {
    const account = await Accounts.getAccountById({ userId, id });
    if (!account) {
      throw new ValidationError({
        message: `Account with ID ${id} not found`,
      });
    }
    assertNotDedicatedFlowAccount({ account, actionPhrase: 'be an import target' });
    return account;
  };

  for (const accountName of uniqueAccountNames) {
    if (alwaysCreate) {
      await createNewAccount(accountName);
      continue;
    }

    const mapping = accountMapping[accountName];

    if (!mapping) {
      // Fallback: when the user picked "single existing account" for the whole import,
      // accountName is empty for every row and per-name mapping is empty. Use defaultAccountId.
      if (defaultAccountId !== undefined) {
        const account = await resolveExistingAccount(defaultAccountId);
        accountNameToId.set(accountName, account.id);
        continue;
      }

      throw new ValidationError({
        message: `No mapping found for account "${accountName}"`,
      });
    }

    if (mapping.action === 'link-existing') {
      const account = await resolveExistingAccount(mapping.accountId);
      accountNameToId.set(accountName, account.id);
    } else if (mapping.action === 'create-new') {
      await createNewAccount(accountName);
    }
  }

  return { accountNameToId, accountsCreated };
}
