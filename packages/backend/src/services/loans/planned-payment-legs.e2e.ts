import { type RecordId, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

type Row = Record<string, unknown>;

const TIMEOUT = 60_000;

/**
 * A planned row is money that has not moved, so it is not a loan payment: it must not
 * appear in `paymentsCount`, must not block deletion, and must not shrink the outstanding
 * balance the recompute derives from the anchor snapshot.
 *
 * The seed goes through a backup round-trip because no write path produces a planned
 * transfer leg — the create/flip/link guards all reject one. Restore bulk-inserts rows
 * verbatim, which is exactly the shape the read paths have to defend against.
 */
const seedLoanWithPlannedLeg = async ({ paymentAmount }: { paymentAmount: number }) => {
  const loan = await helpers.createLoan({
    payload: helpers.buildCreateLoanPayload({ initialBalance: 5_000, originalPrincipal: 5_000 }),
    raw: true,
  });
  const sourceAccount = await helpers.createAccount({ raw: true });

  await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({ accountId: sourceAccount.id, amount: paymentAmount }),
      transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
      destinationAmount: paymentAmount,
      destinationAccountId: loan.id as RecordId,
    },
    raw: true,
  });

  const exported = await helpers.exportBackup();
  expect(exported.statusCode).toBe(200);

  const { files } = helpers.parseBackupArchive({ buffer: exported.body });
  const transactions = JSON.parse(files.get('data/transactions.json')!.toString('utf8')) as Row[];
  const loanLeg = transactions.find((row) => row.accountId === loan.id);
  expect(loanLeg).toBeDefined();
  loanLeg!.isPlanned = true;
  files.set('data/transactions.json', Buffer.from(JSON.stringify(transactions)));

  const restore = await helpers.restoreBackup({ fileContent: await helpers.repackBackup({ files }) });
  expect(restore.statusCode).toBe(200);
  expect((await helpers.waitForRestore({ jobId: restore.jobId! })).status).toBe('completed');

  return { loan, sourceAccount, plannedLegId: loanLeg!.id as string };
};

describe('Loans and planned payment legs', () => {
  it(
    'excludes a planned leg from paymentsCount on the detail and list responses',
    async () => {
      const { loan } = await seedLoanWithPlannedLeg({ paymentAmount: 500 });

      expect((await helpers.getLoanById({ id: loan.id, raw: true })).paymentsCount).toBe(0);
      expect((await helpers.getLoans({ raw: true })).find((row) => row.id === loan.id)?.paymentsCount).toBe(0);
    },
    TIMEOUT,
  );

  it(
    'counts a real leg alongside a planned one exactly once',
    async () => {
      const { loan, sourceAccount } = await seedLoanWithPlannedLeg({ paymentAmount: 500 });

      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: sourceAccount.id, amount: 300 }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 300,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      expect((await helpers.getLoanById({ id: loan.id, raw: true })).paymentsCount).toBe(1);
    },
    TIMEOUT,
  );

  it(
    'lets a loan whose only leg is planned be deleted',
    async () => {
      const { loan } = await seedLoanWithPlannedLeg({ paymentAmount: 500 });

      const response = await helpers.deleteLoan({ id: loan.id, raw: false });

      expect(response.statusCode).toBe(204);
      expect((await helpers.getLoans({ raw: true })).find((row) => row.id === loan.id)).toBeUndefined();
    },
    TIMEOUT,
  );

  it(
    'keeps a planned leg out of the recomputed outstanding balance',
    async () => {
      const { loan, sourceAccount } = await seedLoanWithPlannedLeg({ paymentAmount: 500 });

      // Creating a real payment re-derives the authoritative balance from the anchor
      // snapshot plus post-anchor legs, so only the 300 may reduce the 5_000 owed.
      await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: sourceAccount.id, amount: 300 }),
          transferNature: TRANSACTION_TRANSFER_NATURE.transfer_to_loan,
          destinationAmount: 300,
          destinationAccountId: loan.id as RecordId,
        },
        raw: true,
      });

      expect((await helpers.getLoanById({ id: loan.id, raw: true })).currentBalance).toBe(-4_700);
    },
    TIMEOUT,
  );
});
