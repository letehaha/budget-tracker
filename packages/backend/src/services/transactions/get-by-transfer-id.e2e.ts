import { TRANSACTION_TRANSFER_NATURE } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';

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
});
