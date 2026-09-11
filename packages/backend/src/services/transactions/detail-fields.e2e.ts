import { type RecordId, TRANSACTION_TRANSFER_NATURE, type TransactionLocation } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import type { TransactionApiResponse } from '@root/serializers/transactions.serializer';
import * as helpers from '@tests/helpers';

// `TransactionApiResponse.id` is a plain string; the update helper takes a branded `RecordId`.
type Serialized = TransactionApiResponse & { id: RecordId };

const createTx = async (payload: Parameters<typeof helpers.buildTransactionPayload>[0]) => {
  const result = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload(payload),
    raw: true,
  });
  return result as unknown as Serialized[];
};

describe('Transaction detail fields (external url, reference, location)', () => {
  it('stores both on create, copies them to the transfer leg, and defaults to null', async () => {
    const [account, destination] = await Promise.all([
      helpers.createAccount({ raw: true }),
      helpers.createAccount({ raw: true }),
    ]);

    const [created] = await createTx({
      accountId: account.id,
      externalUrl: 'https://shop.example/orders/42',
      externalReference: 'ORD-42',
    });

    expect(created!.externalUrl).toBe('https://shop.example/orders/42');
    expect(created!.externalReference).toBe('ORD-42');

    const fetched = await helpers.getTransactionById({ id: created!.id, raw: true });
    expect(fetched!.externalUrl).toBe('https://shop.example/orders/42');
    expect(fetched!.externalReference).toBe('ORD-42');

    const [withoutFields] = await createTx({ accountId: account.id });
    expect(withoutFields!.externalUrl).toBeNull();
    expect(withoutFields!.externalReference).toBeNull();

    const [, oppositeLeg] = await createTx({
      accountId: account.id,
      destinationAccountId: destination.id,
      destinationAmount: 1000,
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      externalUrl: 'https://bank.example/transfer/1',
      externalReference: 'TRF-1',
    });
    expect(oppositeLeg!.externalUrl).toBe('https://bank.example/transfer/1');
    expect(oppositeLeg!.externalReference).toBe('TRF-1');
  });

  it('updates and clears both fields', async () => {
    const account = await helpers.createAccount({ raw: true });
    const [created] = await createTx({ accountId: account.id, externalReference: 'OLD' });

    const [updated] = (await helpers.updateTransaction({
      id: created!.id,
      payload: { externalUrl: 'https://shop.example/orders/43', externalReference: 'ORD-43' },
      raw: true,
    })) as unknown as Serialized[];
    expect(updated!.externalUrl).toBe('https://shop.example/orders/43');
    expect(updated!.externalReference).toBe('ORD-43');

    const [untouched] = (await helpers.updateTransaction({
      id: created!.id,
      payload: { externalReference: 'ONLY-REF' },
      raw: true,
    })) as unknown as Serialized[];
    expect(untouched!.externalReference).toBe('ONLY-REF');
    expect(untouched!.externalUrl).toBe('https://shop.example/orders/43');

    const [cleared] = (await helpers.updateTransaction({
      id: created!.id,
      payload: { externalUrl: null, externalReference: null },
      raw: true,
    })) as unknown as Serialized[];
    expect(cleared!.externalUrl).toBeNull();
    expect(cleared!.externalReference).toBeNull();
  });

  it('stores, copies, updates and clears the location', async () => {
    const [account, destination] = await Promise.all([
      helpers.createAccount({ raw: true }),
      helpers.createAccount({ raw: true }),
    ]);

    const [created] = await createTx({ accountId: account.id, location: { latitude: 50.4501, longitude: 30.5234 } });
    expect(created!.location).toEqual({ latitude: 50.4501, longitude: 30.5234 });

    const [withoutLocation] = await createTx({ accountId: account.id });
    expect(withoutLocation!.location).toBeNull();

    const [, oppositeLeg] = await createTx({
      accountId: account.id,
      destinationAccountId: destination.id,
      destinationAmount: 1000,
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      location: { latitude: -33.8688, longitude: 151.2093 },
    });
    expect(oppositeLeg!.location).toEqual({ latitude: -33.8688, longitude: 151.2093 });

    const [updated] = (await helpers.updateTransaction({
      id: created!.id,
      payload: { location: { latitude: 48.8566, longitude: 2.3522 } },
      raw: true,
    })) as unknown as Serialized[];
    expect(updated!.location).toEqual({ latitude: 48.8566, longitude: 2.3522 });

    const [untouched] = (await helpers.updateTransaction({
      id: created!.id,
      payload: { note: 'partial' },
      raw: true,
    })) as unknown as Serialized[];
    expect(untouched!.location).toEqual({ latitude: 48.8566, longitude: 2.3522 });

    const [cleared] = (await helpers.updateTransaction({
      id: created!.id,
      payload: { location: null },
      raw: true,
    })) as unknown as Serialized[];
    expect(cleared!.location).toBeNull();
  });

  it('copies updates and clears to the transfer leg', async () => {
    const [account, destination] = await Promise.all([
      helpers.createAccount({ raw: true }),
      helpers.createAccount({ raw: true }),
    ]);

    const [base] = await createTx({
      accountId: account.id,
      destinationAccountId: destination.id,
      destinationAmount: 1000,
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      externalUrl: 'https://a.example/1',
      externalReference: 'A-1',
      location: { latitude: 1, longitude: 2 },
    });

    const updatedLegs = (await helpers.updateTransaction({
      id: base!.id,
      payload: {
        externalUrl: 'https://b.example/2',
        externalReference: 'B-2',
        location: { latitude: 3, longitude: 4 },
      },
      raw: true,
    })) as unknown as Serialized[];

    expect(updatedLegs).toHaveLength(2);
    for (const leg of updatedLegs) {
      expect(leg.externalUrl).toBe('https://b.example/2');
      expect(leg.externalReference).toBe('B-2');
      expect(leg.location).toEqual({ latitude: 3, longitude: 4 });
    }

    const clearedLegs = (await helpers.updateTransaction({
      id: base!.id,
      payload: { externalUrl: null, externalReference: null, location: null },
      raw: true,
    })) as unknown as Serialized[];

    expect(clearedLegs).toHaveLength(2);
    for (const leg of clearedLegs) {
      expect(leg.externalUrl).toBeNull();
      expect(leg.externalReference).toBeNull();
      expect(leg.location).toBeNull();
    }
  });

  it('rejects half a location pair and out-of-range coordinates', async () => {
    const account = await helpers.createAccount({ raw: true });
    const [created] = await createTx({ accountId: account.id });

    const halfPairOnCreate = (await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({
        accountId: account.id,
        location: { latitude: 50 } as TransactionLocation,
      }),
    })) as helpers.CustomResponse<{ message: string }>;
    expect(halfPairOnCreate.statusCode).toBe(ERROR_CODES.ValidationError);

    const outOfRange = (await helpers.createTransaction({
      payload: helpers.buildTransactionPayload({ accountId: account.id, location: { latitude: 91, longitude: 0 } }),
    })) as helpers.CustomResponse<{ message: string }>;
    expect(outOfRange.statusCode).toBe(ERROR_CODES.ValidationError);

    const halfPairOnUpdate = (await helpers.updateTransaction({
      id: created!.id,
      payload: { location: { longitude: 5 } as TransactionLocation },
    })) as helpers.CustomResponse<{ message: string }>;
    expect(halfPairOnUpdate.statusCode).toBe(ERROR_CODES.ValidationError);
  });

  it('rejects non-http(s) and malformed urls', async () => {
    const account = await helpers.createAccount({ raw: true });

    for (const externalUrl of ['javascript:alert(1)', 'ftp://files.example/a', 'not a url']) {
      const response = (await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, externalUrl }),
      })) as helpers.CustomResponse<{ message: string }>;

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    }
  });
});
