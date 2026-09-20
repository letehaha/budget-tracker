import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

const KYIV = { latitude: 50.4501, longitude: 30.5234 };
const LVIV = { latitude: 49.8397, longitude: 24.0297 };

describe('Payee default location', () => {
  describe('POST + PATCH /payees (defaultLocation)', () => {
    it('sets, updates, and clears the default location', async () => {
      const created = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Silpo', defaultLocation: KYIV }),
        raw: true,
      });
      expect(created.defaultLocation).toEqual(KYIV);

      const bare = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Bare' }),
        raw: true,
      });
      expect(bare.defaultLocation).toBeNull();

      const updated = await helpers.updatePayee({ id: created.id, payload: { defaultLocation: LVIV }, raw: true });
      expect(updated.defaultLocation).toEqual(LVIV);

      const untouched = await helpers.updatePayee({ id: created.id, payload: { name: 'Silpo Market' }, raw: true });
      expect(untouched.defaultLocation).toEqual(LVIV);

      const cleared = await helpers.updatePayee({ id: created.id, payload: { defaultLocation: null }, raw: true });
      expect(cleared.defaultLocation).toBeNull();

      const fetched = await helpers.getPayeeById({ id: created.id, raw: true });
      expect(fetched.defaultLocation).toBeNull();
    });

    it('rejects out-of-range coordinates', async () => {
      const res = await helpers.createPayee({
        payload: helpers.buildPayeePayload({ name: 'Bad', defaultLocation: { latitude: 91, longitude: 0 } }),
      });
      expect(res.statusCode).toBe(ERROR_CODES.ValidationError);

      const payee = await helpers.createPayee({ payload: helpers.buildPayeePayload({ name: 'Ok' }), raw: true });
      const patch = await helpers.updatePayee({
        id: payee.id,
        payload: { defaultLocation: { latitude: 0, longitude: -181 } },
      });
      expect(patch.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('auto-apply on transaction create', () => {
    it('stamps the default location only when the caller did not send one', async () => {
      const [payee, ruleless, account] = await Promise.all([
        helpers.createPayee({
          payload: helpers.buildPayeePayload({ name: 'Silpo', defaultLocation: KYIV }),
          raw: true,
        }),
        helpers.createPayee({ payload: helpers.buildPayeePayload({ name: 'Ruleless' }), raw: true }),
        helpers.createAccount({ raw: true }),
      ]);

      const [noLocation] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, payeeId: payee.id }),
        raw: true,
      });
      expect(noLocation!.location).toEqual(KYIV);
      const fetched = await helpers.getTransactionById({ id: noLocation!.id, raw: true });
      expect(fetched!.location).toEqual(KYIV);

      const [explicitLocation] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, payeeId: payee.id, location: LVIV }),
        raw: true,
      });
      expect(explicitLocation!.location).toEqual(LVIV);

      const [explicitNull] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, payeeId: payee.id, location: null }),
        raw: true,
      });
      expect(explicitNull!.location).toBeNull();

      const [rulelessTx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, payeeId: ruleless.id }),
        raw: true,
      });
      expect(rulelessTx!.location).toBeNull();
    }, 30000);

    it('applies on an extraction match (no caller payeeId)', async () => {
      await helpers.updateUserSettings({
        settings: { locale: 'en', payeeExtractionUsesDescription: true },
      });
      const [payee, account] = await Promise.all([
        helpers.createPayee({
          payload: helpers.buildPayeePayload({ name: 'Spotify', defaultLocation: KYIV }),
          raw: true,
        }),
        helpers.createAccount({ raw: true }),
      ]);

      const [tx] = await helpers.createTransaction({
        payload: helpers.buildTransactionPayload({ accountId: account.id, note: 'Spotify' }),
        raw: true,
      });
      expect(tx!.payeeId).toBe(payee.id);
      expect(tx!.location).toEqual(KYIV);
    }, 30000);
  });
});
