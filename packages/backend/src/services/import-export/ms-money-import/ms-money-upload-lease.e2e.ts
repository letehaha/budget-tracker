import type { MsMoneyAccountMapping } from '@bt/shared/types';
import { MS_MONEY_UPLOAD_IDLE_TTL_MS, MS_MONEY_UPLOAD_MAX_LIFETIME_MS, ResourceLeaseType } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import { MS_MONEY_FIXTURES_MISSING_MESSAGE, msMoneyFixturesAvailable } from '@tests/fixtures/ms-money-fixtures';
import * as helpers from '@tests/helpers';
import { expectMsMoneyCompleted, waitForMsMoneyCompletion } from '@tests/helpers/import-export';
import { asUser, provisionSecondUserWithBaseCurrency } from '@tests/helpers/share';

/**
 * Lease on a cached `.mny` parse result: the wizard refreshes it while the user
 * is interacting, so a slow mapping step does not lose the upload.
 *
 * Minting an upload needs a real `.mny` fixture — `npm run fixtures:ms-money`
 * downloads them, and this suite skips itself when they are absent. The
 * fixture-free cases (unknown id, malformed id, unknown type, auth) live in
 * `resource-lease-registry.e2e.ts`.
 */
const FIXTURE = 'money2005-pwd.mny';
const FIXTURE_PASSWORD = '123@abc!';
const FIXTURE_CURRENCY = 'AUD';

const ACCOUNT_CURRENT = 'Woodgrove Bank Current';
const ACCOUNT_CREDIT_CARD = 'Woodgrove Bank Credit Card';
const ACCOUNT_STOCKS = 'Stocks and Shares (Cash)';

const fixturesAvailable = msMoneyFixturesAvailable();
if (!fixturesAvailable) {
  console.warn(`[ms-money] Skipping the upload-lease suite. ${MS_MONEY_FIXTURES_MISSING_MESSAGE}`);
}
const describeWithFixture = fixturesAvailable ? describe : describe.skip;

const at = ({ instant }: { instant: string }) => new Date(instant).getTime();

/** Lease instants are whole milliseconds, so a refresh landing in the same
 *  millisecond as the upload would return an identical instant and prove nothing. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

const uploadFixture = () => helpers.uploadMsMoneyFixture({ file: FIXTURE, password: FIXTURE_PASSWORD });

const refreshLease = <R extends boolean | undefined = false>({ uploadId, raw }: { uploadId: string; raw?: R }) =>
  helpers.refreshResourceLease<R>({ payload: { type: ResourceLeaseType.msMoneyUpload, id: uploadId }, raw });

const createAudAccount = ({ name }: { name: string }) =>
  helpers.createAccount({
    payload: helpers.buildAccountPayload({ currencyCode: FIXTURE_CURRENCY, name }),
    raw: true,
  });

/**
 * Every parsed account needs a stated decision or the import refuses the job.
 * Skipping the two Woodgrove accounts leaves a single out-of-wallet row, which
 * keeps the import here down to one write.
 */
const onlyStocksMapping = ({ accountId }: { accountId: string }): MsMoneyAccountMapping => ({
  [ACCOUNT_STOCKS]: { action: 'link-existing', accountId },
  [ACCOUNT_CURRENT]: { action: 'skip' },
  [ACCOUNT_CREDIT_CARD]: { action: 'skip' },
});

describeWithFixture('Microsoft Money upload lease', () => {
  describe('POST /resource-leases/refresh', () => {
    it('pushes the expiry out and leaves the absolute ceiling where it was', async () => {
      const upload = await uploadFixture();

      const issued = at({ instant: upload.lease.expiresAt });
      expect(at({ instant: upload.lease.maxExpiresAt })).toBeGreaterThan(issued);

      await tick();
      const refreshed = await refreshLease({ uploadId: upload.uploadId, raw: true });

      expect(at({ instant: refreshed.expiresAt })).toBeGreaterThan(issued);
      // The ceiling is fixed when the upload is stored. Refreshing must not move
      // it, or a wizard left open would hold the parse result forever.
      expect(refreshed.maxExpiresAt).toBe(upload.lease.maxExpiresAt);
      expect(at({ instant: refreshed.expiresAt })).toBeLessThanOrEqual(at({ instant: refreshed.maxExpiresAt }));
    });

    it('grants the full idle window on every refresh', async () => {
      const upload = await uploadFixture();

      await tick();
      const first = await refreshLease({ uploadId: upload.uploadId, raw: true });
      await tick();
      const second = await refreshLease({ uploadId: upload.uploadId, raw: true });

      expect(at({ instant: second.expiresAt })).toBeGreaterThan(at({ instant: first.expiresAt }));
      expect(second.maxExpiresAt).toBe(first.maxExpiresAt);

      // A refresh is worth the whole idle TTL measured from now, not a top-up of
      // whatever was left of the previous one. The slack absorbs the round trip.
      const granted = at({ instant: second.expiresAt }) - Date.now();
      expect(granted).toBeGreaterThan(MS_MONEY_UPLOAD_IDLE_TTL_MS - 60_000);
      expect(granted).toBeLessThanOrEqual(MS_MONEY_UPLOAD_IDLE_TTL_MS);
      expect(at({ instant: second.maxExpiresAt }) - Date.now()).toBeLessThanOrEqual(MS_MONEY_UPLOAD_MAX_LIFETIME_MS);
    });

    /**
     * A refresh rewrites only the lease, so the parse result behind it has to
     * come back whole: the same duplicate detection, and an import that still
     * lands its row.
     */
    it('leaves the cached parse result intact for the following wizard steps', async () => {
      const account = await createAudAccount({ name: 'Lease AUD' });
      const upload = await uploadFixture();
      const accountMapping = onlyStocksMapping({ accountId: account.id });

      const before = await helpers.detectMsMoneyDuplicates({
        payload: { uploadId: upload.uploadId, accountMapping },
        raw: true,
      });

      await refreshLease({ uploadId: upload.uploadId, raw: true });

      const after = await helpers.detectMsMoneyDuplicates({
        payload: { uploadId: upload.uploadId, accountMapping },
        raw: true,
      });
      expect(after).toEqual(before);

      const { jobId } = await helpers.executeMsMoney({
        payload: { uploadId: upload.uploadId, accountMapping },
        raw: true,
      });
      const progress = await waitForMsMoneyCompletion({ jobId });
      expectMsMoneyCompleted(progress);
      expect(progress.summary.errors).toHaveLength(0);
      expect(progress.summary.outOfWalletImported).toBe(1);
    });

    /**
     * The lease is scoped to the uploader. A second user holding the id gets the
     * same 404 as an id that never existed, and their attempt must leave the
     * entry usable by its owner.
     */
    it("refuses another user's upload id without disturbing it", async () => {
      const upload = await uploadFixture();
      const otherUser = await provisionSecondUserWithBaseCurrency();

      await asUser({
        cookies: otherUser.cookies,
        fn: async () => {
          const response = await refreshLease({ uploadId: upload.uploadId });
          expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
        },
      });

      const stillMine = await refreshLease({ uploadId: upload.uploadId });
      expect(stillMine.statusCode).toBe(200);
    });

    it('refuses an upload the import has already consumed', async () => {
      const account = await createAudAccount({ name: 'Consumed AUD' });
      const upload = await uploadFixture();

      const { jobId } = await helpers.executeMsMoney({
        payload: { uploadId: upload.uploadId, accountMapping: onlyStocksMapping({ accountId: account.id }) },
        raw: true,
      });
      const progress = await waitForMsMoneyCompletion({ jobId });
      expectMsMoneyCompleted(progress);

      const response = await refreshLease({ uploadId: upload.uploadId });
      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });
});
