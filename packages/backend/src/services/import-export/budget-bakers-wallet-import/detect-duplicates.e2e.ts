import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { expectCompleted, waitForBudgetBakersWalletCompletion } from '@tests/helpers/import-export';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Detect Budget Bakers Wallet Duplicates endpoint', () => {
  describe('POST /import/budget-bakers-wallet/detect-duplicates', () => {
    /**
     * Empty state: when every account in the mapping uses `create-new`, the
     * service short-circuits before touching the DB (no linked account can
     * have prior transactions) and returns an empty duplicates array.
     */
    it('returns empty duplicates when all accounts are create-new (no linked accounts)', async () => {
      const fileContent = [
        'account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels',
        `NewAcc UAH;Food;UAH;500;500;Expense;Credit card;Test row;2025-06-01T12:00:00.000Z;false;;`,
      ].join('\n');

      // All create-new → service skips DB work entirely.
      const accountMapping = {
        'NewAcc UAH': { action: 'create-new' as const, currencyCode: 'UAH', currentBalance: null },
      };

      const { duplicates } = await helpers.detectBudgetBakersWalletDuplicates({
        payload: { fileContent, accountMapping },
        raw: true,
      });

      expect(duplicates).toEqual([]);
    });

    /**
     * Happy path: import two rows into a linked account, then call
     * detect-duplicates with the same CSV and the same link-existing mapping.
     * BOTH previously imported rows must surface as duplicates with their
     * correct rowIndex values (2 and 3 — header = line 1, first data row = line 2).
     *
     * Seeding is done via executeBudgetBakersWallet (the only route that writes
     * transactions) to stay strictly HTTP-only — no direct service calls.
     */
    it('returns duplicates for rows already present in a linked account', async () => {
      // Create the target account so we can link it.
      const existing = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ currencyCode: 'UAH', initialBalance: 0 }),
        raw: true,
      });

      // Use unique notes to avoid any collision with transactions seeded by other
      // tests running in the same DB instance.
      const note1 = `dup-detect-a-${generateRandomRecordId()}`;
      const note2 = `dup-detect-b-${generateRandomRecordId()}`;

      const fileContent = [
        'account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels',
        `My UAH;Food;UAH;1200;1200;Expense;Credit card;${note1};2025-06-01T12:00:00.000Z;false;;`,
        `My UAH;Salary;UAH;50000;50000;Income;Cash;${note2};2025-06-02T10:00:00.000Z;false;;`,
      ].join('\n');

      const accountMapping = {
        'My UAH': { action: 'link-existing' as const, accountId: existing.id },
      };

      // Seed: import both rows so they exist in the DB.
      const { jobId } = await helpers.executeBudgetBakersWallet({
        payload: { fileContent, accountMapping, skipDuplicateIndices: [] },
        raw: true,
      });
      expect(jobId).toBeTruthy();
      const progress = await waitForBudgetBakersWalletCompletion({ jobId });
      expectCompleted(progress);
      expect(progress.summary.transactionsImported).toBe(2);
      expect(progress.summary.errors).toHaveLength(0);

      // Now detect duplicates — both rows are already in the DB.
      const { duplicates } = await helpers.detectBudgetBakersWalletDuplicates({
        payload: { fileContent, accountMapping },
        raw: true,
      });

      // The parser assigns rowIndex = idx + 2 for each data row:
      //   header = line 1, first data row (expense) = line 2, second (income) = line 3.
      // Both imported rows must surface as duplicates.
      expect(duplicates.length).toBe(2);
      const rowIndices = duplicates.map((d) => d.rowIndex);
      expect(rowIndices).toContain(2);
      expect(rowIndices).toContain(3);
    });

    /**
     * Error case: empty fileContent violates the Zod min(1) constraint on the
     * controller. The request must be rejected with a 422 validation error
     * before any service logic runs.
     */
    it('returns 422 for an empty fileContent string', async () => {
      const response = await helpers.detectBudgetBakersWalletDuplicates({
        payload: {
          fileContent: '',
          accountMapping: {},
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    /**
     * Mixed mapping: when the CSV has some accounts mapped to `link-existing`
     * and some to `create-new`, only the linked accounts' transactions are
     * candidates for duplicate detection. Transactions belonging to the
     * create-new account must NOT appear in the duplicates array.
     *
     * Setup:
     *   - "Linked UAH" → link-existing (pre-seeded, two rows imported first)
     *   - "New UAH"    → create-new (never touched, no prior transactions)
     *
     * After seeding via executeBudgetBakersWallet we call detect-duplicates with
     * the same CSV and a mixed mapping. Only the two "Linked UAH" rows must be
     * returned.
     */
    it('only considers link-existing accounts when detecting duplicates (create-new accounts are excluded)', async () => {
      const existingAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ currencyCode: 'UAH', initialBalance: 0 }),
        raw: true,
      });

      const noteLinked1 = `mixed-linked-a-${generateRandomRecordId()}`;
      const noteLinked2 = `mixed-linked-b-${generateRandomRecordId()}`;

      // Two rows for the linked account; one row for a create-new account.
      const fileContent = [
        'account;category;currency;amount;ref_currency_amount;type;payment_type;note;date;transfer;payee;labels',
        `Linked UAH;Food;UAH;500;500;Expense;Credit card;${noteLinked1};2025-06-01T12:00:00.000Z;false;;`,
        `Linked UAH;Salary;UAH;30000;30000;Income;Cash;${noteLinked2};2025-06-02T10:00:00.000Z;false;;`,
        `New UAH;Groceries;UAH;200;200;Expense;Cash;new-acct-row;2025-06-03T08:00:00.000Z;false;;`,
      ].join('\n');

      // Seed ONLY the linked-account rows by using a link+create-new mapping on first import.
      const seedMapping = {
        'Linked UAH': { action: 'link-existing' as const, accountId: existingAccount.id },
        'New UAH': { action: 'create-new' as const, currencyCode: 'UAH', currentBalance: null },
      };

      const { jobId } = await helpers.executeBudgetBakersWallet({
        payload: { fileContent, accountMapping: seedMapping, skipDuplicateIndices: [] },
        raw: true,
      });
      expect(jobId).toBeTruthy();
      const progress = await waitForBudgetBakersWalletCompletion({ jobId });
      expectCompleted(progress);
      // 2 linked + 1 create-new = 3 ordinary transactions seeded.
      expect(progress.summary.transactionsImported).toBe(3);

      // Re-run detect-duplicates with the same file and same mixed mapping.
      const { duplicates } = await helpers.detectBudgetBakersWalletDuplicates({
        payload: { fileContent, accountMapping: seedMapping },
        raw: true,
      });

      // Only the two "Linked UAH" rows (rowIndex 2 and 3) are detectable.
      // "New UAH" (rowIndex 4) is a create-new account — it has no existing
      // transactions to match against, so it must NOT appear here.
      expect(duplicates.length).toBe(2);
      const rowIndices = duplicates.map((d) => d.rowIndex);
      expect(rowIndices).toContain(2);
      expect(rowIndices).toContain(3);
      expect(rowIndices).not.toContain(4);
    });
  });
});
