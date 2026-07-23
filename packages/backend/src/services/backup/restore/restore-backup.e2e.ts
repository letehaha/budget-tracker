import {
  AI_PROVIDER,
  API_ERROR_CODES,
  BANK_PROVIDER_TYPE,
  DEACTIVATION_REASON,
  RESOURCE_TYPES,
  SHARE_PERMISSIONS,
  SUBSCRIPTION_FREQUENCIES,
  TRANSACTION_TRANSFER_NATURE,
  TRANSACTION_TYPES,
  VEHICLE_CLASS,
} from '@bt/shared/types';
import { INVESTMENT_TRANSACTION_CATEGORY } from '@bt/shared/types/investments';
import { VENTURE_CASH_FLOW_MODE, VENTURE_EVENT_TYPE } from '@bt/shared/types/venture';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { RateLimitService } from '@services/common/rate-limit.service';
import * as helpers from '@tests/helpers';
import { VALID_MONOBANK_TOKEN } from '@tests/mocks/monobank/mock-api';

type Row = Record<string, unknown>;

// Tables whose restored copy legitimately differs from the dump: `user` and
// `user-settings` are re-created rather than bulk-inserted (fresh ids/timestamps,
// Zod-normalized settings).
const ROUNDTRIP_EXCLUDED = new Set(['user', 'user-settings']);

// --- Canonicalization: order-independent, key-sorted deep equality -----------

function deepSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepSort);
  if (value && typeof value === 'object') {
    const out: Row = {};
    for (const key of Object.keys(value as Row).sort()) out[key] = deepSort((value as Row)[key]);
    return out;
  }
  return value;
}

/** A stable, sorted list of canonical JSON strings for a row array. */
function canonicalRows(rows: unknown): string[] {
  const arr = Array.isArray(rows) ? rows : [];
  return arr.map((row) => JSON.stringify(deepSort(row))).sort();
}

// --- Archive read/write helpers (for building tampered uploads) --------------

function readArchiveJson({ files, path }: { files: Map<string, Buffer>; path: string }): unknown {
  const buf = files.get(path);
  return buf ? JSON.parse(buf.toString('utf8')) : null;
}

function writeArchiveJson({ files, path, value }: { files: Map<string, Buffer>; path: string; value: unknown }): void {
  files.set(path, Buffer.from(JSON.stringify(value)));
}

async function getCurrentUserId(): Promise<number> {
  const user = await helpers.makeRequest({ method: 'get', url: '/user', raw: true });
  return (user as { id: number }).id;
}

/** Export the current user and return both the raw zip and its base64 upload form. */
async function exportArchive(): Promise<{ buffer: Buffer; base64: string }> {
  const res = await helpers.exportBackup();
  expect(res.statusCode).toBe(200);
  const buffer = res.body;
  return { buffer, base64: buffer.toString('base64') };
}

// --- Seeders -----------------------------------------------------------------

/** A broad, cross-tier dataset exercising money, transfers, splits, refunds,
 *  self-ref categories, composite-PK tables, investments and venture. */
async function seedRichData() {
  await helpers.addUserCurrencies({ currencyCodes: ['USD'], raw: true });
  await helpers.updateUserSettings({ settings: { locale: 'uk' } });
  await helpers.editCurrencyExchangeRate({
    pairs: [{ baseCode: global.BASE_CURRENCY_CODE, quoteCode: 'USD', rate: 0.27 }],
    raw: true,
  });

  const checking = await helpers.createAccount({
    payload: helpers.buildAccountPayload({ name: 'Checking', initialBalance: 500000 }),
    raw: true,
  });
  const savings = await helpers.createAccount({
    payload: helpers.buildAccountPayload({ name: 'Savings', initialBalance: 1000000 }),
    raw: true,
  });

  const parentCategory = await helpers.addCustomCategory({ name: 'Living', color: '#112233', raw: true });
  const childCategory = await helpers.addCustomCategory({
    name: 'Groceries',
    color: '#445566',
    parentId: parentCategory.id,
    raw: true,
  });

  const tag = await helpers.createTag({ payload: helpers.buildTagPayload({ name: 'reimbursable' }), raw: true });

  const payee = await helpers.createPayee({ payload: helpers.buildPayeePayload({ name: 'Corner Shop' }), raw: true });
  await helpers.createPayeeAlias({ payeeId: payee.id, rawName: 'CORNER SHOP #12', raw: true });

  // Expense with a split + a tag.
  const [expense] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId: checking.id,
      amount: 3000,
      transactionType: TRANSACTION_TYPES.expense,
      categoryId: childCategory.id,
      splits: [{ categoryId: parentCategory.id, amount: 1200 }],
    }),
    raw: true,
  });
  await helpers.addTransactionsToTag({ tagId: tag.id, transactionIds: [expense!.id], raw: true });

  // Transfer pair between the two accounts.
  await helpers.createTransaction({
    payload: {
      ...helpers.buildTransactionPayload({
        accountId: checking.id,
        amount: 2500,
        transactionType: TRANSACTION_TYPES.expense,
        categoryId: childCategory.id,
      }),
      transferNature: TRANSACTION_TRANSFER_NATURE.common_transfer,
      destinationAmount: 2500,
      destinationAccountId: savings.id,
    },
    raw: true,
  });

  // Refund: an income transaction refunding the original expense.
  const [refundTx] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId: checking.id,
      amount: 1000,
      transactionType: TRANSACTION_TYPES.income,
      categoryId: childCategory.id,
    }),
    raw: true,
  });
  await helpers.createSingleRefund({ originalTxId: expense!.id, refundTxId: refundTx!.id }, true);

  // Budget over a category, with a linked transaction.
  const budget = await helpers.createCustomBudget({
    name: 'Monthly',
    limitAmount: 50000,
    categoryIds: [parentCategory.id],
    raw: true,
  });
  await helpers.addTransactionToCustomBudget({ id: budget.id, payload: { transactionIds: [expense!.id] }, raw: true });

  // Subscription (generates periods).
  await helpers.createSubscription({
    name: 'Streaming',
    expectedAmount: 1599,
    expectedCurrencyCode: global.BASE_CURRENCY_CODE,
    frequency: SUBSCRIPTION_FREQUENCIES.monthly,
    startDate: '2025-01-01',
    raw: true,
  });

  // Loan + vehicle (each spins up its own backing account).
  await helpers.createLoan({ payload: helpers.buildCreateLoanPayload(), raw: true });
  await helpers.createVehicle({
    name: 'Daily Driver',
    currencyCode: global.BASE_CURRENCY.code,
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    vehicleClass: VEHICLE_CLASS.sedan,
    purchasePrice: 2000000,
    purchaseDate: '2022-01-01',
    raw: true,
  });

  // Investments: portfolio + security + holding + a buy.
  const portfolio = await helpers.createPortfolio({ payload: { name: 'Brokerage' }, raw: true });
  const [security] = await helpers.seedSecurities([{ symbol: 'VOO', name: 'Vanguard S&P 500 ETF' }]);
  await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: security!.id }, raw: true });
  await helpers.createInvestmentTransaction({
    payload: {
      portfolioId: portfolio.id,
      securityId: security!.id,
      category: INVESTMENT_TRANSACTION_CATEGORY.buy,
      quantity: '3',
      price: '410.55',
      date: '2025-02-01',
    },
    raw: true,
  });

  // Venture: platform -> deal -> event.
  const platform = await helpers.createVenturePlatform({ payload: { name: 'Acme Ventures' }, raw: true });
  const deal = await helpers.createVentureDeal({
    payload: { name: 'Seed deal', platformId: platform.id, currencyCode: 'USD' },
    raw: true,
  });
  await helpers.createVentureEvent({
    dealId: deal.id,
    payload: {
      type: VENTURE_EVENT_TYPE.nav_update,
      eventDate: '2026-06-24',
      cashFlowMode: VENTURE_CASH_FLOW_MODE.none,
      navAfter: '18500',
    },
    raw: true,
  });

  return { checking, savings, parentCategory, childCategory, portfolio, security: security! };
}

/** A lighter dataset: two accounts, a category tree, a tagged transaction. */
async function seedBasicData() {
  const accountA = await helpers.createAccount({
    payload: helpers.buildAccountPayload({ name: 'Account A', initialBalance: 300000 }),
    raw: true,
  });
  const accountB = await helpers.createAccount({
    payload: helpers.buildAccountPayload({ name: 'Account B', initialBalance: 150000 }),
    raw: true,
  });
  const category = await helpers.addCustomCategory({ name: 'Utilities', color: '#0a0b0c', raw: true });

  const [tx] = await helpers.createTransaction({
    payload: helpers.buildTransactionPayload({
      accountId: accountA.id,
      amount: 4200,
      transactionType: TRANSACTION_TYPES.expense,
      categoryId: category.id,
    }),
    raw: true,
  });

  return { accountA, accountB, category, tx: tx! };
}

describe('Data backup restore (POST /user/backup/restore)', () => {
  // Export and restore have their own per-user rate buckets (5 per 15 min each),
  // enforced in the test env. Reset both for the primary user before each case.
  beforeEach(async () => {
    const userId = await getCurrentUserId();
    await RateLimitService.resetRateLimit(`backup:user:${userId}`);
    await RateLimitService.resetRateLimit(`backup-restore:user:${userId}`);
  });

  describe('Round-trip', () => {
    it('restoring an export into the same user reproduces every table byte-for-byte', async () => {
      await seedRichData();

      const first = await exportArchive();
      const firstArchive = helpers.parseBackupArchive({ buffer: first.buffer });

      // Sanity: the dump is genuinely populated, so equality below is not vacuous.
      expect((firstArchive.readData({ name: 'transactions' }) as unknown[]).length).toBeGreaterThan(0);
      expect((firstArchive.readData({ name: 'holdings' }) as unknown[]).length).toBeGreaterThan(0);
      expect((firstArchive.readData({ name: 'transaction-splits' }) as unknown[]).length).toBeGreaterThan(0);

      const restore = await helpers.restoreBackup({ fileContent: first.base64 });
      expect(restore.statusCode).toBe(200);
      expect(restore.jobId).toBeTruthy();
      const status = await helpers.waitForRestore({ jobId: restore.jobId! });
      expect(status.status).toBe('completed');

      const second = await exportArchive();
      const secondArchive = helpers.parseBackupArchive({ buffer: second.buffer });

      const dataNames = [...firstArchive.files.keys()]
        .filter((p) => p.startsWith('data/') && p.endsWith('.json'))
        .map((p) => p.slice('data/'.length, -'.json'.length));

      for (const name of dataNames) {
        if (ROUNDTRIP_EXCLUDED.has(name)) continue;
        const before = canonicalRows(firstArchive.readData({ name }));
        const after = canonicalRows(secondArchive.readData({ name }));
        expect({ name, rows: after }).toEqual({ name, rows: before });
      }

      // reference/securities.json must also round-trip (prices aren't part of a backup).
      const secBefore = canonicalRows(
        readArchiveJson({ files: firstArchive.files, path: 'reference/securities.json' }),
      );
      const secAfter = canonicalRows(
        readArchiveJson({ files: secondArchive.files, path: 'reference/securities.json' }),
      );
      expect(secAfter).toEqual(secBefore);
      expect(secBefore.length).toBeGreaterThan(0);

      // User-scoped fields the restore updates in place survive the round-trip.
      const userBefore = firstArchive.readData({ name: 'user' }) as Row;
      const userAfter = secondArchive.readData({ name: 'user' }) as Row;
      for (const field of ['defaultCategoryId', 'firstName', 'lastName', 'middleName', 'totalBalance', 'avatar']) {
        expect(userAfter[field]).toEqual(userBefore[field]);
      }

      // The non-default setting round-trips through the Zod re-parse.
      const settingsAfter = (secondArchive.readData({ name: 'user-settings' }) as Row[])[0]!;
      expect((settingsAfter.settings as { locale?: string }).locale).toBe('uk');
    });
  });

  describe('Cross-user restore', () => {
    it('re-owns every restored row under the target user, leaving nothing under the source', async () => {
      const { accountA, accountB, tx } = await seedBasicData();
      const portfolio = await helpers.createPortfolio({ payload: { name: 'Source PF' }, raw: true });
      const [security] = await helpers.seedSecurities([{ symbol: 'VTI', name: 'Vanguard Total Market' }]);
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: security!.id }, raw: true });

      const sourceUserId = await getCurrentUserId();
      const sourceAccountIds = new Set([accountA.id, accountB.id]);
      const { base64 } = await exportArchive();

      // Free the source UUIDs so restoring the same ids into another user on this
      // single instance can't collide (a real cross-instance restore wouldn't).
      const wipeRes = await helpers.wipeUserData();
      expect(wipeRes.statusCode).toBe(200);
      expect(await helpers.getAccounts()).toHaveLength(0);

      const target = await helpers.provisionSecondUserWithBaseCurrency();
      await helpers.asUser({
        cookies: target.cookies,
        fn: async () => {
          const restore = await helpers.restoreBackup({ fileContent: base64 });
          expect(restore.statusCode).toBe(200);
          const status = await helpers.waitForRestore({ jobId: restore.jobId! });
          expect(status.status).toBe('completed');

          // The target now sees the source's accounts, by their original UUIDs.
          const targetAccounts = await helpers.getAccounts();
          const targetAccountIds = new Set(targetAccounts.map((a) => a.id));
          for (const id of sourceAccountIds) expect(targetAccountIds.has(id)).toBe(true);

          // The tagged transaction is visible under the target user too.
          const targetTx = await helpers.getTransactionById({ id: tx.id, raw: true });
          expect(targetTx).not.toBeNull();

          // Holdings were remapped and are readable under the target.
          const holdings = await helpers.getHoldings({ portfolioId: portfolio.id, payload: {}, raw: true });
          expect(holdings.some((h) => h.securityId === security!.id)).toBe(true);
        },
      });

      // The source user stays empty — restore did not resurrect its rows.
      expect(await helpers.getAccounts()).toHaveLength(0);
      expect(sourceUserId).not.toBe(await helpers.findAppUserByEmail({ email: target.email }).then((u) => u.id));
    });
  });

  describe('Securities resolve-or-create', () => {
    it('creates an absent security and remaps its holdings', async () => {
      const portfolio = await helpers.createPortfolio({ payload: { name: 'Resolve PF' }, raw: true });
      const [security] = await helpers.seedSecurities([{ symbol: 'AAA', name: 'Alpha Fund' }]);
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: security!.id }, raw: true });

      const { buffer } = await exportArchive();
      const { files } = helpers.parseBackupArchive({ buffer });

      // Rewrite the backup so its security is unknown to the catalog on every
      // unique key: fresh UUID + a symbol/ISIN/CUSIP and a providerSymbol that
      // match nothing on the target. providerName+providerSymbol is a real DB
      // unique index, so a unique providerSymbol is required (a valid providerName
      // is kept) or resolve would correctly match the existing seeded row instead.
      const oldId = security!.id;
      const newId = generateRandomRecordId();
      const uniqueSymbol = `ZZ${generateRandomRecordId().slice(0, 6)}`;
      const uniqueProviderSymbol = `ZZP${generateRandomRecordId().slice(0, 6)}`;
      const securities = readArchiveJson({ files, path: 'reference/securities.json' }) as Row[];
      for (const sec of securities) {
        if (sec.id === oldId) {
          sec.id = newId;
          sec.symbol = uniqueSymbol;
          sec.providerSymbol = uniqueProviderSymbol;
          sec.isin = null;
          sec.cusip = null;
        }
      }
      writeArchiveJson({ files, path: 'reference/securities.json', value: securities });
      remapSecurityIdInArchive({ files, oldId, newId });

      const securitiesBefore = await helpers.getAllSecurities({ raw: true });
      const base64 = await helpers.repackBackup({ files });
      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      const status = await helpers.waitForRestore({ jobId: restore.jobId! });
      expect(status.status).toBe('completed');

      // A new security row was created and the holding points at it.
      const securitiesAfter = await helpers.getAllSecurities({ raw: true });
      expect(securitiesAfter.length).toBe(securitiesBefore.length + 1);
      expect(securitiesAfter.some((s) => s.symbol === uniqueSymbol)).toBe(true);

      const holdings = await helpers.getHoldings({ portfolioId: portfolio.id, payload: {}, raw: true });
      expect(holdings.some((h) => h.securityId === newId)).toBe(true);
    });

    it('remaps to an existing security under a different UUID without creating a duplicate', async () => {
      const portfolio = await helpers.createPortfolio({ payload: { name: 'Remap PF' }, raw: true });
      const [security] = await helpers.seedSecurities([{ symbol: 'BBB', name: 'Beta Fund' }]);
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: security!.id }, raw: true });

      const { buffer } = await exportArchive();
      const { files } = helpers.parseBackupArchive({ buffer });

      // Same natural key (symbol/currency/provider), different UUID → must resolve
      // to the catalog's existing row.
      const oldId = security!.id;
      const newId = generateRandomRecordId();
      const securities = readArchiveJson({ files, path: 'reference/securities.json' }) as Row[];
      for (const sec of securities) if (sec.id === oldId) sec.id = newId;
      writeArchiveJson({ files, path: 'reference/securities.json', value: securities });
      remapSecurityIdInArchive({ files, oldId, newId });

      const securitiesBefore = await helpers.getAllSecurities({ raw: true });
      const base64 = await helpers.repackBackup({ files });
      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      const status = await helpers.waitForRestore({ jobId: restore.jobId! });
      expect(status.status).toBe('completed');

      // No duplicate security, and the holding points at the pre-existing catalog id.
      const securitiesAfter = await helpers.getAllSecurities({ raw: true });
      expect(securitiesAfter.length).toBe(securitiesBefore.length);

      const holdings = await helpers.getHoldings({ portfolioId: portfolio.id, payload: {}, raw: true });
      expect(holdings.some((h) => h.securityId === oldId)).toBe(true);
      expect(holdings.some((h) => h.securityId === newId)).toBe(false);
    });

    it('ignores a pricing file smuggled into the archive (never writes global SecurityPricing)', async () => {
      const portfolio = await helpers.createPortfolio({ payload: { name: 'Pricing PF' }, raw: true });
      const [security] = await helpers.seedSecurities([{ symbol: 'CCC', name: 'Gamma Fund' }]);
      await helpers.createHolding({ payload: { portfolioId: portfolio.id, securityId: security!.id }, raw: true });

      const { buffer } = await exportArchive();
      const { files } = helpers.parseBackupArchive({ buffer });

      // A tampered backup smuggles a pricing file back in — the vector an attacker
      // would use to gap-fill poisoned prices for a security other users hold.
      // repackBackup lists and checksums it, so it passes integrity; the restore
      // must still ignore it because prices are not a restorable resource.
      const poisoned: Row[] = [{ securityId: security!.id, date: '1990-01-01', priceClose: '999999' }];
      writeArchiveJson({ files, path: 'reference/security-pricing.json', value: poisoned });

      const base64 = await helpers.repackBackup({ files });
      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      const status = await helpers.waitForRestore({ jobId: restore.jobId! });
      expect(status.status).toBe('completed');

      // The holding round-tripped (summary is populated), but the restore has no
      // pricing step at all, so the smuggled rows were never inserted.
      expect(status.summary?.insertedByTable.holdings).toBeGreaterThan(0);
      expect(status.summary?.insertedByTable).not.toHaveProperty('security-pricing');
    });
  });

  describe('Secrets never leak', () => {
    it('deactivates a restored bank connection and never carries a plaintext secret', async () => {
      const connect = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });
      const connectionId = connect.connectionId;

      const aiKeyNeedle = `ai-secret-${Date.now()}`;
      await helpers.patchUserSettings({
        patch: {
          ai: {
            apiKeys: [
              { provider: AI_PROVIDER.anthropic, keyEncrypted: aiKeyNeedle, createdAt: new Date().toISOString() },
            ],
          },
        },
        raw: true,
      });

      const { buffer, base64 } = await exportArchive();
      const archive = helpers.parseBackupArchive({ buffer });
      const allText = [...archive.files.values()].map((buf) => buf.toString('utf8')).join('\n');
      expect(allText).not.toContain(VALID_MONOBANK_TOKEN);
      expect(allText).not.toContain(aiKeyNeedle);
      expect(allText).not.toMatch(/"keyEncrypted"/);

      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      const status = await helpers.waitForRestore({ jobId: restore.jobId! });
      expect(status.status).toBe('completed');

      // The connection came back (same id) but is honestly marked "reconnect required".
      const details = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(details.connection.isActive).toBe(false);
      expect(details.connection.deactivationReason).toBe(DEACTIVATION_REASON.RESTORED);

      // Re-exporting still blanks the credentials — no secret survives a round-trip.
      const after = await exportArchive();
      const afterArchive = helpers.parseBackupArchive({ buffer: after.buffer });
      const connections = afterArchive.readData({ name: 'bank-data-provider-connections' }) as Row[];
      expect(connections.length).toBeGreaterThan(0);
      for (const conn of connections) expect(conn.credentials).toBeNull();
    });
  });

  describe('Atomicity', () => {
    it('rolls back a restore whose data violates a foreign key, leaving the original data intact', async () => {
      const { accountA, tx } = await seedBasicData();
      const accountsBefore = await helpers.getAccounts();
      const accountIdsBefore = accountsBefore.map((a) => a.id).sort();
      const txBefore = await helpers.getTransactions({ raw: true });
      const txIdsBefore = txBefore.map((t) => t.id).sort();

      const { buffer } = await exportArchive();
      const { files } = helpers.parseBackupArchive({ buffer });

      // Point a transaction at an account that doesn't exist — a real FK violation
      // the worker hits mid-insert. Checksums are refreshed so preflight passes.
      const transactions = readArchiveJson({ files, path: 'data/transactions.json' }) as Row[];
      const target = transactions.find((t) => t.id === tx.id) ?? transactions[0]!;
      target.accountId = generateRandomRecordId();
      writeArchiveJson({ files, path: 'data/transactions.json', value: transactions });
      const base64 = await helpers.repackBackup({ files });

      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      const status = await helpers.waitForRestore({ jobId: restore.jobId! });
      expect(status.status).toBe('failed');

      // Nothing was wiped: the pre-restore accounts and transactions are all still there.
      const accountsAfter = await helpers.getAccounts();
      expect(accountsAfter.map((a) => a.id).sort()).toEqual(accountIdsBefore);
      expect(accountsAfter.some((a) => a.id === accountA.id)).toBe(true);
      const txAfter = await helpers.getTransactions({ raw: true });
      expect(txAfter.map((t) => t.id).sort()).toEqual(txIdsBefore);
    });
  });

  describe('Rejections', () => {
    it('rejects a backup whose format version is newer than supported (422)', async () => {
      await seedBasicData();
      const { buffer } = await exportArchive();
      const { files, manifest } = helpers.parseBackupArchive({ buffer });

      manifest.formatVersion = 2;
      writeArchiveJson({ files, path: 'manifest.json', value: manifest });
      const base64 = await helpers.repackBackup({ files });

      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(422);
      expect(restore.message).toMatch(/version/i);
    });

    it('rejects a backup whose file checksum no longer matches the manifest (422)', async () => {
      await seedBasicData();
      const { buffer } = await exportArchive();
      const { files } = helpers.parseBackupArchive({ buffer });

      const categories = readArchiveJson({ files, path: 'data/categories.json' }) as Row[];
      categories.push({ ...categories[0], id: generateRandomRecordId(), name: 'Tampered' });
      writeArchiveJson({ files, path: 'data/categories.json', value: categories });
      // Leave the manifest stale so the recomputed hash won't match.
      const base64 = await helpers.repackBackup({ files, syncChecksums: false });

      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(422);
      expect(restore.message).toMatch(/checksum|integrity/i);
    });

    it('rejects a backup missing a required column and names the column (422)', async () => {
      await seedBasicData();
      const { buffer } = await exportArchive();
      const { files } = helpers.parseBackupArchive({ buffer });

      const accounts = readArchiveJson({ files, path: 'data/accounts.json' }) as Row[];
      for (const account of accounts) delete account.name;
      writeArchiveJson({ files, path: 'data/accounts.json', value: accounts });
      const base64 = await helpers.repackBackup({ files });

      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(422);
      expect(restore.message).toContain('name');
    });

    it('rejects an empty-manifest / missing-user archive without wiping existing data (422)', async () => {
      // Pre-existing data that MUST survive a rejected restore.
      const { accountA, tx } = await seedBasicData();
      const accountsBefore = await helpers.getAccounts();
      expect(accountsBefore.length).toBeGreaterThan(0);

      const { buffer } = await exportArchive();
      const { files } = helpers.parseBackupArchive({ buffer });

      // Keep only manifest.json and drop every data/reference file. Repacking syncs
      // checksums over the now-empty file set, yielding a structurally valid zip
      // whose manifest vouches for nothing and whose data/user.json is gone — the
      // corruption shape that previously wiped everything and reported success.
      const manifestOnly = new Map<string, Buffer>();
      manifestOnly.set('manifest.json', files.get('manifest.json')!);
      const base64 = await helpers.repackBackup({ files: manifestOnly });

      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(422);
      expect(restore.message).toMatch(/no user record|no files|refusing to wipe/i);

      // The wipe never ran: the pre-restore account and transaction are still there.
      const accountsAfter = await helpers.getAccounts();
      expect(accountsAfter.some((a) => a.id === accountA.id)).toBe(true);
      const txAfter = await helpers.getTransactions({ raw: true });
      expect(txAfter.some((t) => t.id === tx.id)).toBe(true);
    });

    it('rejects a malformed manifest.json with 422 rather than a generic 500', async () => {
      await seedBasicData();
      const { buffer } = await exportArchive();
      const { files } = helpers.parseBackupArchive({ buffer });

      // A JSON array where an object is expected. Dereferencing manifest fields on
      // it throws a raw TypeError (mapped to 500) without the shape guard.
      files.set('manifest.json', Buffer.from(JSON.stringify([])));
      const base64 = await helpers.repackBackup({ files, syncChecksums: false });

      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(422);
      expect(restore.message).toMatch(/malformed manifest/i);
    });

    it('requires a sharing acknowledgement when the user owns shared resources (409)', async () => {
      const account = await helpers.createAccount({ raw: true });
      const { base64 } = await exportArchive();

      const recipient = await helpers.provisionSecondUserWithBaseCurrency();
      const invitation = await helpers.createShareInvitation({
        inviteeEmail: recipient.email,
        resourceType: RESOURCE_TYPES.account,
        resourceId: account.id,
        permission: SHARE_PERMISSIONS.read,
        raw: true,
      });
      await helpers.asUser({
        cookies: recipient.cookies,
        fn: () => helpers.acceptShareInvitation({ token: invitation.token, raw: true }),
      });

      const withoutAck = await helpers.restoreBackup({ fileContent: base64 });
      expect(withoutAck.statusCode).toBe(409);
      expect(withoutAck.code).toBe(API_ERROR_CODES.wipeDataSharingAcknowledgementRequired);
      expect(withoutAck.details?.sharedResources).toBeDefined();

      // The account still exists — the 409 path did not touch any data.
      expect(await helpers.getAccounts()).toHaveLength(1);

      // With the acknowledgement the same upload proceeds.
      const withAck = await helpers.restoreBackup({ fileContent: base64, acknowledgeSharing: true });
      expect(withAck.statusCode).toBe(200);
      const status = await helpers.waitForRestore({ jobId: withAck.jobId! });
      expect(status.status).toBe('completed');
    });
  });

  describe('Empty state', () => {
    it('restoring an empty backup wipes a previously-seeded user back to empty', async () => {
      // Capture the fresh (empty) user's backup before seeding anything.
      const { base64 } = await exportArchive();

      await seedBasicData();
      expect((await helpers.getAccounts()).length).toBeGreaterThan(0);
      expect((await helpers.getTransactions({ raw: true })).length).toBeGreaterThan(0);

      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      const status = await helpers.waitForRestore({ jobId: restore.jobId! });
      expect(status.status).toBe('completed');

      // The transactional tables are empty again — down to the backup's empty state.
      expect(await helpers.getAccounts()).toHaveLength(0);
      expect(await helpers.getTransactions({ raw: true })).toHaveLength(0);
    });
  });

  describe('Restored connection needs reauth', () => {
    it('surfaces a restored bank connection in the sync-status reauth list', async () => {
      const connect = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });
      const connectionId = connect.connectionId;

      const { base64 } = await exportArchive();
      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      const status = await helpers.waitForRestore({ jobId: restore.jobId! });
      expect(status.status).toBe('completed');

      // The restored connection came back deactivated with reason `restored`, so the
      // sync-status endpoint must list it as needing reconnection.
      const syncStatus = (await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/status',
        raw: true,
      })) as { connectionsNeedingReauth: Array<{ connectionId: string }> };
      expect(syncStatus.connectionsNeedingReauth.some((c) => c.connectionId === connectionId)).toBe(true);
    });

    it('reactivates a restored Monobank connection once its credentials are updated', async () => {
      const connect = await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });
      const connectionId = connect.connectionId;

      const { base64 } = await exportArchive();
      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      const status = await helpers.waitForRestore({ jobId: restore.jobId! });
      expect(status.status).toBe('completed');

      // Restore leaves the connection deactivated with reason `restored`.
      const deactivated = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(deactivated.connection.isActive).toBe(false);
      expect(deactivated.connection.deactivationReason).toBe(DEACTIVATION_REASON.RESTORED);

      // Re-supplying a valid token must clear the reauth state, not just store creds.
      await helpers.bankDataProviders.updateConnectionDetails({
        connectionId,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const reactivated = await helpers.bankDataProviders.getConnectionDetails({ connectionId, raw: true });
      expect(reactivated.connection.isActive).toBe(true);
      expect(reactivated.connection.deactivationReason).toBeNull();

      // And it must drop off the sync-status reauth list.
      const syncStatus = (await helpers.makeRequest({
        method: 'get',
        url: '/bank-data-providers/sync/status',
        raw: true,
      })) as { connectionsNeedingReauth: Array<{ connectionId: string }> };
      expect(syncStatus.connectionsNeedingReauth.some((c) => c.connectionId === connectionId)).toBe(false);
    });
  });

  describe('Settings schema drift', () => {
    it('restores with a settings_reset warning when the backup settings no longer validate', async () => {
      await helpers.updateUserSettings({ settings: { locale: 'uk' } });
      const { buffer } = await exportArchive();
      const { files } = helpers.parseBackupArchive({ buffer });

      // Corrupt the settings blob with a value the current schema rejects (an
      // unknown locale). A backup taken across a schema change would look like this.
      const settingsRows = readArchiveJson({ files, path: 'data/user-settings.json' }) as Row[];
      (settingsRows[0]!.settings as Row).locale = 'not-a-real-locale';
      writeArchiveJson({ files, path: 'data/user-settings.json', value: settingsRows });
      const base64 = await helpers.repackBackup({ files });

      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      const status = await helpers.waitForRestore({ jobId: restore.jobId! });

      // The restore completes instead of hard-failing, and warns that settings reset.
      expect(status.status).toBe('completed');
      expect(status.summary?.warnings.some((w) => w.code === 'settings_reset')).toBe(true);
    });
  });

  // A second restore fired while one is in flight is rejected (the enqueue guard
  // returns 423, and once the worker holds the base-currency lock the route guard
  // returns 423 too). Not asserted here: the restore worker runs in-process and a
  // small test dataset finishes before a second request can observe the in-flight
  // job, so a real concurrency assertion would be timing-dependent and flaky in the
  // CLS-shared-transaction e2e environment. Left as a documented gap rather than a
  // flaky test.
  it.skip('rejects a concurrent restore for the same user (423)', () => {});

  // The user-scoped status endpoint (no job id) any device polls on boot to learn a
  // restore is in flight and, after it lands, to wipe caches + reload once.
  describe('User-scoped status (GET /user/backup/restore/status)', () => {
    it('reports idle for a user who has never restored', async () => {
      const status = await helpers.getActiveRestoreStatus({ raw: true });
      expect(status.state).toBe('idle');
    });

    it('reports completed with the summary once a restore lands', async () => {
      await seedBasicData();
      const { base64 } = await exportArchive();

      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      const terminal = await helpers.waitForRestore({ jobId: restore.jobId! });
      expect(terminal.status).toBe('completed');

      const status = await helpers.getActiveRestoreStatus({ raw: true });
      expect(status.state).toBe('completed');
      if (status.state !== 'completed') throw new Error('unreachable');
      expect(status.jobId).toBe(restore.jobId);
      expect(status.summary.insertedByTable).toBeDefined();
    });

    it('is scoped per user — a second user who never restored still sees idle', async () => {
      await seedBasicData();
      const { base64 } = await exportArchive();
      const restore = await helpers.restoreBackup({ fileContent: base64 });
      expect(restore.statusCode).toBe(200);
      await helpers.waitForRestore({ jobId: restore.jobId! });

      const target = await helpers.provisionSecondUserWithBaseCurrency();
      await helpers.asUser({
        cookies: target.cookies,
        fn: async () => {
          const status = await helpers.getActiveRestoreStatus({ raw: true });
          expect(status.state).toBe('idle');
        },
      });
    });
  });
});

/** Rewrite every `securityId` reference in the archive from `oldId` to `newId`,
 *  across the only files that carry one (holdings, investment transactions). */
function remapSecurityIdInArchive({
  files,
  oldId,
  newId,
}: {
  files: Map<string, Buffer>;
  oldId: string;
  newId: string;
}): void {
  const paths = ['data/holdings.json', 'data/investment-transactions.json'];
  for (const path of paths) {
    const rows = readArchiveJson({ files, path });
    if (!Array.isArray(rows)) continue;
    let changed = false;
    for (const row of rows as Row[]) {
      if (row.securityId === oldId) {
        row.securityId = newId;
        changed = true;
      }
    }
    if (changed) writeArchiveJson({ files, path, value: rows });
  }
}
