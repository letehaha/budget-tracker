import { RESOURCE_TYPES, TRANSACTION_TRANSFER_NATURE, TRANSACTION_TYPES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

/**
 * Cross-user transfers across a household membership.
 *
 * Setup convention: the primary test user (test1) is the *source* of the transfer; a
 * freshly-provisioned second user (`recipient`) owns a household that they invite test1
 * into. The accepted household share grants test1 write access to the recipient's
 * accounts — which is the condition that lets test1 create a transfer whose destination
 * leg lives on the other user's account.
 *
 * The lifecycle pieces under test:
 *   1. Transfer creation succeeds and writes each leg under its own owner's `userId`
 *      with each side's refAmount in the right base currency.
 *   2. When the household membership ends (recipient leaves, or recipient revokes test1),
 *      pre-existing cross-user pairs convert to `transfer_out_wallet` with a note suffix
 *      describing the counterpart, leaving balances intact.
 *   3. Same-user transfers untouched by the household break.
 */
describe('Cross-user transfer (household membership)', () => {
  describe('creation', () => {
    it('writes each leg under its own owner and updates both balances', async () => {
      // test1 (source) — uses default cookies.
      const sourceAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'Source A', initialBalance: 10000 }),
        raw: true,
      });
      const sourceUser = await helpers.findAppUserByEmail({ email: 'test1@test.local' });

      // recipient (dest) — owns a household that test1 joins.
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientUser = await helpers.findAppUserByEmail({ email: recipient.email });

      const destAccount = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createAccount({
            payload: helpers.buildAccountPayload({ name: 'Dest B', initialBalance: 2000 }),
            raw: true,
          }),
      });

      const invitation = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createHouseholdInvitation({ ownerUserId: recipientUser.id, inviteeEmail: 'test1@test.local' }),
      });
      await helpers.acceptShareInvitation({ token: invitation.token, raw: true });

      const [baseTx, oppositeTx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 5000,
          destinationAccountId: destAccount.id,
        },
        raw: true,
      });

      expect(baseTx).toBeDefined();
      expect(oppositeTx).toBeDefined();
      expect(baseTx.transferId).toBeTruthy();
      expect(baseTx.transferId).toBe(oppositeTx!.transferId);

      // Each leg belongs to its account's owner.
      expect(baseTx.userId).toBe(sourceUser.id);
      expect(oppositeTx!.userId).toBe(recipientUser.id);
      expect(baseTx.accountId).toBe(sourceAccount.id);
      expect(oppositeTx!.accountId).toBe(destAccount.id);
      expect(baseTx.transactionType).toBe(TRANSACTION_TYPES.expense);
      expect(oppositeTx!.transactionType).toBe(TRANSACTION_TYPES.income);

      // categoryId is dropped on the cross-user opposite — the source's category belongs
      // to test1, not the recipient.
      expect(oppositeTx!.categoryId).toBeNull();

      // Balances move on both sides.
      const sourceAfter = await helpers.getAccount({ id: sourceAccount.id, raw: true });
      expect(sourceAfter.currentBalance).toBe(Number(sourceAccount.currentBalance) - 5000);

      const destAfter = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.getAccount({ id: destAccount.id, raw: true }),
      });
      expect(destAfter.currentBalance).toBe(Number(destAccount.currentBalance) + 5000);
    });

    it('returns 404 when caller has no access to the destination account', async () => {
      const sourceAccount = await helpers.createAccount({ raw: true });
      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      // recipient's account, *without* sharing it back with test1.
      const isolatedDest = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.createAccount({ raw: true }),
      });

      const res = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: sourceAccount.id, amount: 5000 }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 5000,
          destinationAccountId: isolatedDest.id,
        },
      });

      expect(res.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('on household share break', () => {
    const setupCrossUserTransfer = async () => {
      const sourceAccount = await helpers.createAccount({
        payload: helpers.buildAccountPayload({ name: 'A Account', initialBalance: 10000 }),
        raw: true,
      });
      const sourceUser = await helpers.findAppUserByEmail({ email: 'test1@test.local' });

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const recipientUser = await helpers.findAppUserByEmail({ email: recipient.email });

      const destAccount = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createAccount({
            payload: helpers.buildAccountPayload({ name: 'B Account', initialBalance: 2000 }),
            raw: true,
          }),
      });

      const invitation = await helpers.asUser({
        cookies: recipient.cookies,
        fn: () =>
          helpers.createHouseholdInvitation({ ownerUserId: recipientUser.id, inviteeEmail: 'test1@test.local' }),
      });
      await helpers.acceptShareInvitation({ token: invitation.token, raw: true });

      const [baseTx, oppositeTx] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({
            accountId: sourceAccount.id,
            amount: 5000,
            transactionType: TRANSACTION_TYPES.expense,
          }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 5000,
          destinationAccountId: destAccount.id,
        },
        raw: true,
      });

      return { sourceAccount, destAccount, sourceUser, recipient, recipientUser, baseTx, oppositeTx: oppositeTx! };
    };

    it('converts the pair when the recipient leaves the household', async () => {
      const ctx = await setupCrossUserTransfer();

      await helpers.leaveShare({
        resourceType: RESOURCE_TYPES.household,
        resourceId: ctx.recipientUser.id,
        raw: true,
      });

      // After conversion both legs should be `transfer_out_wallet`, transferId cleared,
      // and the note should encode where the counterpart used to live so the user keeps
      // a paper trail.
      const baseAfter = await helpers.getTransactionById({ id: ctx.baseTx.id, raw: true });
      expect(baseAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
      expect(baseAfter!.transferId).toBeNull();
      expect(baseAfter!.note).toContain(`@${ctx.recipientUser.username}`);
      expect(baseAfter!.note).toContain('B Account');
      // expense side describes "to @other"
      expect(baseAfter!.note).toContain('to ');

      const oppositeAfter = await helpers.asUser({
        cookies: ctx.recipient.cookies,
        fn: () => helpers.getTransactionById({ id: ctx.oppositeTx.id, raw: true }),
      });
      expect(oppositeAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
      expect(oppositeAfter!.transferId).toBeNull();
      expect(oppositeAfter!.note).toContain(`@${ctx.sourceUser.username}`);
      expect(oppositeAfter!.note).toContain('A Account');
      // income side describes "from @other"
      expect(oppositeAfter!.note).toContain('from ');

      // Balances are not touched — out_of_wallet conversion preserves the cash movement
      // on each side independently.
      const sourceAfter = await helpers.getAccount({ id: ctx.sourceAccount.id, raw: true });
      expect(sourceAfter.currentBalance).toBe(Number(ctx.sourceAccount.currentBalance) - 5000);

      const destAfter = await helpers.asUser({
        cookies: ctx.recipient.cookies,
        fn: () => helpers.getAccount({ id: ctx.destAccount.id, raw: true }),
      });
      expect(destAfter.currentBalance).toBe(Number(ctx.destAccount.currentBalance) + 5000);
    });

    it('converts the pair when the recipient (owner) revokes the member', async () => {
      const ctx = await setupCrossUserTransfer();

      await helpers.asUser({
        cookies: ctx.recipient.cookies,
        fn: () =>
          helpers.revokeShareMember({
            resourceType: RESOURCE_TYPES.household,
            resourceId: ctx.recipientUser.id,
            memberUserId: ctx.sourceUser.id,
            raw: true,
          }),
      });

      const baseAfter = await helpers.getTransactionById({ id: ctx.baseTx.id, raw: true });
      expect(baseAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
      expect(baseAfter!.transferId).toBeNull();

      const oppositeAfter = await helpers.asUser({
        cookies: ctx.recipient.cookies,
        fn: () => helpers.getTransactionById({ id: ctx.oppositeTx.id, raw: true }),
      });
      expect(oppositeAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.transfer_out_wallet);
      expect(oppositeAfter!.transferId).toBeNull();
    });

    it('leaves same-user transfers in place when the household ends', async () => {
      // test1 also has a *self* transfer between two of their own accounts. The household
      // break only affects transfers that cross the membership boundary; intra-user pairs
      // must keep their `common_transfer` link.
      const ctx = await setupCrossUserTransfer();

      const selfA = await helpers.createAccount({ raw: true });
      const selfB = await helpers.createAccount({ raw: true });
      const [selfBase, selfOpposite] = await helpers.createTransaction({
        payload: {
          ...helpers.buildTransactionPayload({ accountId: selfA.id, amount: 2000 }),
          transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
          destinationAmount: 2000,
          destinationAccountId: selfB.id,
        },
        raw: true,
      });

      await helpers.leaveShare({
        resourceType: RESOURCE_TYPES.household,
        resourceId: ctx.recipientUser.id,
        raw: true,
      });

      const selfBaseAfter = await helpers.getTransactionById({ id: selfBase.id, raw: true });
      const selfOppositeAfter = await helpers.getTransactionById({ id: selfOpposite!.id, raw: true });
      expect(selfBaseAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
      expect(selfBaseAfter!.transferId).toBe(selfBase.transferId);
      expect(selfOppositeAfter!.transferNature).toBe(TRANSACTION_TRANSFER_NATURE.common_transfer);
      expect(selfOppositeAfter!.transferId).toBe(selfOpposite!.transferId);
    });

    it('tx-list reads on both sides keep working after conversion', async () => {
      // Regression guard: post-conversion the transferId is null, so the get-by-transfer-id
      // endpoint should return an empty list (rather than crash) and the per-user tx list
      // should still surface each side's leg with its new out_of_wallet shape.
      const ctx = await setupCrossUserTransfer();

      await helpers.leaveShare({
        resourceType: RESOURCE_TYPES.household,
        resourceId: ctx.recipientUser.id,
        raw: true,
      });

      const sourceTxList = await helpers.getTransactions({ raw: true });
      expect(sourceTxList.some((tx) => tx.id === ctx.baseTx.id)).toBe(true);

      const recipientTxList = await helpers.asUser({
        cookies: ctx.recipient.cookies,
        fn: () => helpers.getTransactions({ raw: true }),
      });
      expect(recipientTxList.some((tx) => tx.id === ctx.oppositeTx.id)).toBe(true);
    });
  });
});
