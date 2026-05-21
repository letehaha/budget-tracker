/**
 * Budget sharing lifecycle — cleanup sweeps on revoke, leave, and budget deletion.
 *
 * Verifies that recipient-attached BudgetTransactions rows are swept when access
 * is removed, and that budget deletion cleans up ResourceShares + ShareInvitations
 * while leaving the recipient's underlying Transactions intact.
 *
 * See `docs/prds/family-sharing-budgets.md` Phase 5 — Lifecycle sweeps.
 */

import { RESOURCE_TYPES, SHARE_INVITATION_STATUSES, SHARE_PERMISSIONS } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import BudgetTransactions from '@models/budget-transactions.model';
import ResourceShares from '@models/resource-shares.model';
import ShareInvitations from '@models/share-invitations.model';
import Transactions from '@models/transactions.model';
import * as helpers from '@tests/helpers';

// ---------------------------------------------------------------------------
// Scaffold helpers
// ---------------------------------------------------------------------------

interface RecipientHandle extends helpers.SecondUserHandle {}

async function provisionRecipient(): Promise<RecipientHandle> {
  const handle = await helpers.signUpSecondUser();
  await helpers.asUser({
    cookies: handle.cookies,
    fn: async () => {
      const res = await helpers.setBaseCurrencyForActiveUser({ currencyCode: global.BASE_CURRENCY.code });
      if (res.statusCode !== 200) {
        throw new Error(`Failed to set base currency: ${res.statusCode} ${JSON.stringify(res.body)}`);
      }
    },
  });
  return handle;
}

async function shareBudgetAndAccept({
  budgetId,
  recipient,
  permission = SHARE_PERMISSIONS.write,
}: {
  budgetId: string;
  recipient: RecipientHandle;
  permission?: (typeof SHARE_PERMISSIONS)[keyof typeof SHARE_PERMISSIONS];
}): Promise<void> {
  const invitation = await helpers.createShareInvitation({
    inviteeEmail: recipient.email,
    resourceType: RESOURCE_TYPES.budget,
    resourceId: budgetId,
    permission,
    raw: true,
  });
  await helpers.asUser({
    cookies: recipient.cookies,
    fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
  });
}

/**
 * Recipient attaches N of their own transactions to a budget.
 * Returns the transaction ids that were attached.
 */
async function recipientAttachesTxs({
  budgetId,
  recipientCookies,
  count,
}: {
  budgetId: string;
  recipientCookies: string;
  count: number;
}): Promise<string[]> {
  // Create a recipient-owned account and category so the transactions are valid for the recipient.
  const recipientAccount = await helpers.asUser({
    cookies: recipientCookies,
    fn: () => helpers.createAccount({ raw: true }),
  });
  const recipientCategory = await helpers.asUser({
    cookies: recipientCookies,
    fn: () => helpers.addCustomCategory({ name: 'Recipient lifecycle cat', color: '#AABBCC', raw: true }),
  });

  const txIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const [tx] = await helpers.asUser({
      cookies: recipientCookies,
      fn: () =>
        helpers.createTransaction({
          payload: helpers.buildTransactionPayload({
            accountId: recipientAccount.id,
            categoryId: recipientCategory.id,
          }),
          raw: true,
        }),
    });
    txIds.push(tx!.id);
  }

  await helpers.asUser({
    cookies: recipientCookies,
    fn: () =>
      helpers.addTransactionToCustomBudget({
        id: budgetId,
        payload: { transactionIds: txIds },
        raw: true,
      }),
  });

  return txIds;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Budget sharing lifecycle', () => {
  describe('Revoke share', () => {
    it("sweeps recipient's BudgetTransactions rows; owner's rows and recipient's Transactions rows untouched", async () => {
      const account = await helpers.createAccount({ raw: true });
      const budget = await helpers.createCustomBudget({ name: 'Revoke sweep', raw: true });

      // Owner attaches their own tx first
      const [ownerTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, amount: 100 }),
        raw: true,
      });
      await helpers.addTransactionToCustomBudget({
        id: budget.id,
        payload: { transactionIds: [ownerTx!.id] },
        raw: true,
      });

      const recipient = await provisionRecipient();
      await shareBudgetAndAccept({ budgetId: budget.id, recipient });

      // Recipient attaches 2 of their own txs
      const recipientTxIds = await recipientAttachesTxs({
        budgetId: budget.id,
        recipientCookies: recipient.cookies,
        count: 2,
      });

      // Confirm rows exist before revoke
      const beforeRecipientRows = await BudgetTransactions.findAll({
        where: { budgetId: budget.id, transactionId: recipientTxIds },
      });
      expect(beforeRecipientRows).toHaveLength(2);

      // Owner revokes the share
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });
      await helpers.revokeShareMember({
        resourceType: RESOURCE_TYPES.budget,
        resourceId: budget.id,
        memberUserId: recipientApp.id,
        raw: true,
      });

      // ResourceShares row gone
      const shareRow = await ResourceShares.findOne({
        where: {
          resourceType: RESOURCE_TYPES.budget,
          resourceId: budget.id,
          sharedWithUserId: recipientApp.id,
        },
      });
      expect(shareRow).toBeNull();

      // Recipient's BudgetTransactions rows swept
      const afterRecipientRows = await BudgetTransactions.findAll({
        where: { budgetId: budget.id, transactionId: recipientTxIds },
      });
      expect(afterRecipientRows).toHaveLength(0);

      // Owner's BudgetTransactions row still present
      const ownerRow = await BudgetTransactions.findOne({
        where: { budgetId: budget.id, transactionId: ownerTx!.id },
      });
      expect(ownerRow).not.toBeNull();

      // Recipient's underlying Transactions rows are untouched
      for (const txId of recipientTxIds) {
        const tx = await Transactions.findByPk(txId);
        expect(tx).not.toBeNull();
      }
    });
  });

  describe('Leave share', () => {
    it("sweeps recipient's BudgetTransactions rows when recipient leaves", async () => {
      const budget = await helpers.createCustomBudget({ name: 'Leave sweep', raw: true });

      const recipient = await provisionRecipient();
      await shareBudgetAndAccept({ budgetId: budget.id, recipient });

      const recipientTxIds = await recipientAttachesTxs({
        budgetId: budget.id,
        recipientCookies: recipient.cookies,
        count: 2,
      });

      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      // Recipient leaves
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.leaveShare({
            resourceType: RESOURCE_TYPES.budget,
            resourceId: budget.id,
            raw: true,
          }),
      });

      // ResourceShares row gone
      const shareRow = await ResourceShares.findOne({
        where: {
          resourceType: RESOURCE_TYPES.budget,
          resourceId: budget.id,
          sharedWithUserId: recipientApp.id,
        },
      });
      expect(shareRow).toBeNull();

      // Recipient's BudgetTransactions rows swept
      const afterRows = await BudgetTransactions.findAll({
        where: { budgetId: budget.id, transactionId: recipientTxIds },
      });
      expect(afterRows).toHaveLength(0);

      // Underlying Transactions rows survive
      for (const txId of recipientTxIds) {
        const tx = await Transactions.findByPk(txId);
        expect(tx).not.toBeNull();
      }
    });
  });

  describe('Budget deletion', () => {
    it('deletes budget, sweeps ResourceShares, revokes pending invitation, cascades BudgetTransactions', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Delete sweep single', raw: true });

      // 1 accepted recipient
      const recipient = await provisionRecipient();
      await shareBudgetAndAccept({ budgetId: budget.id, recipient });
      const recipientApp = await helpers.findAppUserByEmail({ email: recipient.email });

      const recipientTxIds = await recipientAttachesTxs({
        budgetId: budget.id,
        recipientCookies: recipient.cookies,
        count: 1,
      });

      // 1 pending invitation
      const pendingUser = await provisionRecipient();
      const pendingInvitation = await helpers.createShareInvitation({
        inviteeEmail: pendingUser.email,
        resourceType: RESOURCE_TYPES.budget,
        resourceId: budget.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });

      // Delete the budget
      const res = await helpers.deleteCustomBudget({ id: budget.id, raw: false });
      expect(res.statusCode).toBe(200);

      // Budget gone
      const budgetRow = await helpers.getCustomBudgetById({ id: budget.id, raw: false });
      expect(budgetRow.statusCode).toBe(404);

      // ResourceShares row gone
      const shareRow = await ResourceShares.findOne({
        where: {
          resourceType: RESOURCE_TYPES.budget,
          resourceId: budget.id,
          sharedWithUserId: recipientApp.id,
        },
      });
      expect(shareRow).toBeNull();

      // Pending invitation flipped to revoked
      const invitationAfter = await ShareInvitations.findByPk(pendingInvitation.id);
      expect(invitationAfter).not.toBeNull();
      expect(invitationAfter!.status).toBe(SHARE_INVITATION_STATUSES.revoked);
      expect(invitationAfter!.revokedAt).not.toBeNull();

      // BudgetTransactions rows gone (cascade)
      const btRows = await BudgetTransactions.findAll({
        where: { budgetId: budget.id },
      });
      expect(btRows).toHaveLength(0);

      // Recipient's underlying Transactions rows survive
      for (const txId of recipientTxIds) {
        const tx = await Transactions.findByPk(txId);
        expect(tx).not.toBeNull();
      }
    });

    it('deletes budget with 2 recipients — both recipients rows gone, both shares gone', async () => {
      const budget = await helpers.createCustomBudget({ name: 'Delete sweep two recipients', raw: true });

      const recipientA = await provisionRecipient();
      const recipientB = await provisionRecipient();
      await shareBudgetAndAccept({ budgetId: budget.id, recipient: recipientA });
      await shareBudgetAndAccept({ budgetId: budget.id, recipient: recipientB });

      const recipientAApp = await helpers.findAppUserByEmail({ email: recipientA.email });
      const recipientBApp = await helpers.findAppUserByEmail({ email: recipientB.email });

      const txIdsA = await recipientAttachesTxs({
        budgetId: budget.id,
        recipientCookies: recipientA.cookies,
        count: 1,
      });
      const txIdsB = await recipientAttachesTxs({
        budgetId: budget.id,
        recipientCookies: recipientB.cookies,
        count: 1,
      });

      await helpers.deleteCustomBudget({ id: budget.id, raw: true });

      // Both ResourceShares rows gone
      const shareA = await ResourceShares.findOne({
        where: {
          resourceType: RESOURCE_TYPES.budget,
          resourceId: budget.id,
          sharedWithUserId: recipientAApp.id,
        },
      });
      const shareB = await ResourceShares.findOne({
        where: {
          resourceType: RESOURCE_TYPES.budget,
          resourceId: budget.id,
          sharedWithUserId: recipientBApp.id,
        },
      });
      expect(shareA).toBeNull();
      expect(shareB).toBeNull();

      // All BudgetTransactions rows gone
      const btRows = await BudgetTransactions.findAll({ where: { budgetId: budget.id } });
      expect(btRows).toHaveLength(0);

      // Both recipients' underlying Transactions survive
      for (const txId of [...txIdsA, ...txIdsB]) {
        const tx = await Transactions.findByPk(txId);
        expect(tx).not.toBeNull();
      }
    });
  });
});
