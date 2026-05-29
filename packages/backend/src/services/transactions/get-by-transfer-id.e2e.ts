import { RESOURCE_TYPES, SHARE_PERMISSIONS, TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import * as helpers from '@tests/helpers';
import { describe, expect, it } from 'vitest';

describe('Retrieve transaction by transfer id', () => {
  it('should retrieve transaction by transfer id', async () => {
    const accountA = await helpers.createAccount({ raw: true });
    const accountB = await helpers.createAccount({ raw: true });
    const [base] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: accountA.id,
          amount: 5000,
        }),
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: 10000,
        destinationAccountId: accountB.id,
      },
      raw: true,
    });

    const res = await helpers.getTransactionsByTransferId({
      transferId: base.transferId,
      raw: true,
    });

    expect(res.length).toBe(2);
  });

  it('should not retrieve transaction by transfer id when [out of wallet] cause transferId is null', async () => {
    const accountA = await helpers.createAccount({ raw: true });
    const [base] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: accountA.id,
          amount: 5000,
        }),
        transferNature: TRANSACTION_TRANSFER_NATURE.transfer_out_wallet,
      },
      raw: true,
    });

    const res = await helpers.getTransactionsByTransferId({
      transferId: base.transferId,
      raw: true,
    });

    expect(res.length).toBe(0);
  });

  it('returns both legs to a household recipient even when neither leg was authored by them', async () => {
    // Reproduces the "Hidden account" UI bug: inviter creates a transfer between two of
    // their own accounts; the recipient (granted household access) used to see only zero
    // legs because the model query filtered by `Transactions.userId` (the author), which
    // never matches across users. Visibility must follow account access, not authorship.
    const ownerAccountA = await helpers.createAccount({ raw: true });
    const ownerAccountB = await helpers.createAccount({ raw: true });
    const [base] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: ownerAccountA.id,
          amount: 5000,
        }),
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: 5000,
        destinationAccountId: ownerAccountB.id,
      },
      raw: true,
    });

    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const inv = await helpers.createHouseholdInvitation({
      ownerUserId: ownerAccountA.userId,
      inviteeEmail: recipient.email,
    });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: inv.token, raw: true }),
    });

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.getTransactionsByTransferId({ transferId: base.transferId, raw: true }),
    });

    expect(res.length).toBe(2);
    const accountIds = new Set(res.map((tx) => tx.accountId));
    expect(accountIds).toEqual(new Set([ownerAccountA.id, ownerAccountB.id]));
  });

  it('returns only the visible leg to a per-resource recipient when the other leg lives on a private account', async () => {
    // Per-resource sharing narrows visibility to the shared account only — the opposite
    // leg lives on the owner's still-private account, so the recipient must not see it.
    // Keeps the "Hidden account" placeholder honest for genuinely-hidden counterparts.
    const sharedAccount = await helpers.createAccount({ raw: true });
    const privateAccount = await helpers.createAccount({ raw: true });
    const [base] = await helpers.createTransaction({
      payload: {
        ...helpers.buildTransactionPayload({
          accountId: sharedAccount.id,
          amount: 5000,
        }),
        transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
        destinationAmount: 5000,
        destinationAccountId: privateAccount.id,
      },
      raw: true,
    });

    const recipient = await helpers.provisionSecondUserWithBaseCurrency();
    const inv = await helpers.createShareInvitation({
      inviteeEmail: recipient.email,
      resourceType: RESOURCE_TYPES.account,
      resourceId: sharedAccount.id,
      permission: SHARE_PERMISSIONS.read,
      raw: true,
    });
    await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.acceptShareInvitation({ token: inv.token, raw: true }),
    });

    const res = await helpers.asUser({
      cookies: recipient.cookies,
      fn: () => helpers.getTransactionsByTransferId({ transferId: base.transferId, raw: true }),
    });

    expect(res.length).toBe(1);
    expect(res[0]!.accountId).toBe(sharedAccount.id);
  });
});
