import { TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

describe('Transaction Groups API', () => {
  // Helper to create N transactions for a given account
  const createTransactions = async ({ accountId, count }: { accountId: number; count: number }) => {
    const txs: { id: number }[] = [];
    for (let i = 0; i < count; i++) {
      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId,
          amount: 100 + i,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });
      txs.push(tx);
    }
    return txs;
  };

  describe('POST /transaction-groups (create)', () => {
    it('successfully creates a group with 2 transactions', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 2 });

      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Salary Transfer',
          note: 'Monthly salary chain',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      expect(group.id).toBeDefined();
      expect(group.name).toBe('Salary Transfer');
      expect(group.note).toBe('Monthly salary chain');
      expect(group.transactions).toHaveLength(2);
    });

    it('fails to create a group with less than 2 transactions', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 1 });

      const response = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Too Small',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails when transactions already belong to another group', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 3 });

      // Create first group with tx[0] and tx[1]
      await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Group 1',
          transactionIds: [txs[0]!.id, txs[1]!.id],
        }),
        raw: true,
      });

      // Try to create second group with tx[1] (already in Group 1) and tx[2]
      const response = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Group 2',
          transactionIds: [txs[1]!.id, txs[2]!.id],
        }),
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    });

    it('fails with invalid transaction IDs', async () => {
      const response = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Invalid',
          transactionIds: [999999, 999998],
        }),
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('fails with empty name', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 2 });

      const response = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: '',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('GET /transaction-groups (list)', () => {
    it('returns all groups for the user', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 4 });

      await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Group A',
          transactionIds: [txs[0]!.id, txs[1]!.id],
        }),
        raw: true,
      });

      await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Group B',
          transactionIds: [txs[2]!.id, txs[3]!.id],
        }),
        raw: true,
      });

      const groups = await helpers.getTransactionGroups({ raw: true });

      expect(groups.length).toBeGreaterThanOrEqual(2);
      const names = groups.map((g) => g.name);
      expect(names).toContain('Group A');
      expect(names).toContain('Group B');
    });

    it('returns groups with computed aggregates', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 3 });

      await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Aggregated Group',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      const groups = await helpers.getTransactionGroups({ raw: true });
      const group = groups.find((g) => g.name === 'Aggregated Group');

      expect(group).toBeDefined();
      expect(group!.transactionCount).toBe(3);
      expect(group!.dateFrom).toBeDefined();
      expect(group!.dateTo).toBeDefined();
    });
  });

  describe('GET /transaction-groups/:id (get by id)', () => {
    it('returns a group with its transactions', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 2 });

      const created = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Detail Group',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      const group = await helpers.getTransactionGroupById({ id: created.id, raw: true });

      expect(group.id).toBe(created.id);
      expect(group.name).toBe('Detail Group');
      expect(group.transactions).toHaveLength(2);
    });

    it('returns 404 for non-existent group', async () => {
      const response = await helpers.getTransactionGroupById({ id: 999999, raw: false });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('PUT /transaction-groups/:id (update)', () => {
    it('updates group name and note', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 2 });

      const created = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Old Name',
          note: 'Old note',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      const updated = await helpers.updateTransactionGroup({
        id: created.id,
        payload: { name: 'New Name', note: 'New note' },
        raw: true,
      });

      expect(updated.name).toBe('New Name');
      expect(updated.note).toBe('New note');
    });

    it('clears note when set to null', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 2 });

      const created = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Note Test',
          note: 'Will be cleared',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      const updated = await helpers.updateTransactionGroup({
        id: created.id,
        payload: { note: null },
        raw: true,
      });

      expect(updated.note).toBeNull();
    });

    it('returns 404 for non-existent group', async () => {
      const response = await helpers.updateTransactionGroup({
        id: 999999,
        payload: { name: 'Nope' },
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('DELETE /transaction-groups/:id (delete/dissolve)', () => {
    it('dissolves a group and keeps transactions', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 2 });

      const created = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'To Delete',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      const result = await helpers.deleteTransactionGroup({ id: created.id, raw: true });
      expect(result.success).toBe(true);

      // Group should be gone
      const response = await helpers.getTransactionGroupById({ id: created.id, raw: false });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);

      // Transactions should still exist
      const txsAfter = await helpers.getTransactionsByIds({
        ids: txs.map((t) => t.id),
        raw: true,
      });
      expect(txsAfter).toHaveLength(2);
    });

    it('returns 404 for non-existent group', async () => {
      const response = await helpers.deleteTransactionGroup({ id: 999999, raw: false });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('POST /transaction-groups/:id/transactions (add)', () => {
    it('adds transactions to an existing group', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 4 });

      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Expandable',
          transactionIds: [txs[0]!.id, txs[1]!.id],
        }),
        raw: true,
      });

      const updated = await helpers.addTransactionsToGroup({
        groupId: group.id,
        transactionIds: [txs[2]!.id, txs[3]!.id],
        raw: true,
      });

      expect(updated.transactions).toHaveLength(4);
    });

    it('fails when adding transaction already in another group', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 4 });

      await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Group X',
          transactionIds: [txs[0]!.id, txs[1]!.id],
        }),
        raw: true,
      });

      const groupY = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Group Y',
          transactionIds: [txs[2]!.id, txs[3]!.id],
        }),
        raw: true,
      });

      // Try to add tx[0] (in Group X) to Group Y
      const response = await helpers.addTransactionsToGroup({
        groupId: groupY.id,
        transactionIds: [txs[0]!.id],
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    });

    it('fails when exceeding max group size', async () => {
      const account = await helpers.createAccount({ raw: true });
      // Create 50 transactions for max size group
      const txs = await createTransactions({ accountId: account.id, count: 50 });

      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Max Size',
          transactionIds: txs.slice(0, 50).map((t) => t.id),
        }),
        raw: true,
      });

      // Create one more transaction
      const [extraTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: account.id,
          amount: 9999,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      const response = await helpers.addTransactionsToGroup({
        groupId: group.id,
        transactionIds: [extraTx.id],
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('DELETE /transaction-groups/:id/transactions (remove)', () => {
    it('removes transactions from a group', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 4 });

      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Shrinkable',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      const result = await helpers.removeTransactionsFromGroup({
        groupId: group.id,
        transactionIds: [txs[0]!.id],
        raw: true,
      });

      expect(result.dissolved).toBe(false);
      expect(result.group).not.toBeNull();
      expect(result.group!.transactions).toHaveLength(3);
    });

    it('returns conflict when removal would dissolve (without force)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 2 });

      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Will Dissolve',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      // Removing one from a 2-member group leaves < 2
      const response = await helpers.removeTransactionsFromGroup({
        groupId: group.id,
        transactionIds: [txs[0]!.id],
        raw: false,
      });

      expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
    });

    it('dissolves group when force=true and removal leaves < 2', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 2 });

      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Force Dissolve',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      const result = await helpers.removeTransactionsFromGroup({
        groupId: group.id,
        transactionIds: [txs[0]!.id],
        force: true,
        raw: true,
      });

      expect(result.dissolved).toBe(true);
      expect(result.group).toBeNull();

      // Group should be gone
      const check = await helpers.getTransactionGroupById({ id: group.id, raw: false });
      expect(check.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('Auto-dissolve on transaction deletion', () => {
    it('auto-dissolves group when deleting a transaction leaves < 2 members', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 2 });

      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Auto Dissolve',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      // Delete one transaction
      await helpers.deleteTransaction({ id: txs[0]!.id });

      // Group should be auto-dissolved
      const check = await helpers.getTransactionGroupById({ id: group.id, raw: false });
      expect(check.statusCode).toBe(ERROR_CODES.NotFoundError);
    });

    it('keeps group intact when deleting a transaction leaves >= 2 members (from 3)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const txs = await createTransactions({ accountId: account.id, count: 3 });

      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Survives Deletion',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      // Delete one transaction from a 3-member group
      await helpers.deleteTransaction({ id: txs[0]!.id });

      // Group should still exist with 2 members
      const remaining = await helpers.getTransactionGroupById({ id: group.id, raw: true });
      expect(remaining.transactions).toHaveLength(2);
    });
  });

  describe('Transfer pair auto-inclusion', () => {
    it('auto-includes opposite transfer transaction when creating a group with one side', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      // Create two transactions and link them as a transfer pair
      const [income] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });
      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountB.id,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      await helpers.linkTransactions({
        payload: { ids: [[income.id, expense.id]] },
        raw: true,
      });

      // Create a third standalone transaction
      const [standalone] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      // Create group with only the expense side + standalone — income side should be auto-included
      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Transfer Auto Include',
          transactionIds: [expense.id, standalone.id],
        }),
        raw: true,
      });

      expect(group.transactions).toHaveLength(3);
      const txIds = group.transactions!.map((t) => t.id);
      expect(txIds).toContain(income.id);
      expect(txIds).toContain(expense.id);
      expect(txIds).toContain(standalone.id);
    });

    it('auto-includes opposite transfer when adding to an existing group', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      // Create a basic group first
      const txs = await createTransactions({ accountId: accountA.id, count: 2 });
      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Add Transfer Later',
          transactionIds: txs.map((t) => t.id),
        }),
        raw: true,
      });

      // Create a linked transfer pair
      const [income] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });
      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountB.id,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      await helpers.linkTransactions({
        payload: { ids: [[income.id, expense.id]] },
        raw: true,
      });

      // Add only one side — opposite should be auto-included
      const updated = await helpers.addTransactionsToGroup({
        groupId: group.id,
        transactionIds: [income.id],
        raw: true,
      });

      expect(updated.transactions).toHaveLength(4); // 2 original + 2 transfer sides
      const txIds = updated.transactions!.map((t) => t.id);
      expect(txIds).toContain(income.id);
      expect(txIds).toContain(expense.id);
    });

    it('does not duplicate when both sides of transfer are explicitly provided', async () => {
      const accountA = await helpers.createAccount({ raw: true });
      const accountB = await helpers.createAccount({ raw: true });

      const [income] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountA.id,
          transactionType: TRANSACTION_TYPES.income,
        }),
        raw: true,
      });
      const [expense] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({
          accountId: accountB.id,
          transactionType: TRANSACTION_TYPES.expense,
        }),
        raw: true,
      });

      await helpers.linkTransactions({
        payload: { ids: [[income.id, expense.id]] },
        raw: true,
      });

      // Provide both sides explicitly
      const group = await helpers.createTransactionGroup({
        payload: helpers.buildTransactionGroupPayload({
          name: 'Both Sides Explicit',
          transactionIds: [income.id, expense.id],
        }),
        raw: true,
      });

      expect(group.transactions).toHaveLength(2);
    });
  });
});
