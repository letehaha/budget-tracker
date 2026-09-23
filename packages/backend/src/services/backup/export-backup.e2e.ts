import { AI_PROVIDER, BACKUP_FORMAT_VERSION, BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { RateLimitService } from '@services/common/rate-limit.service';
import * as helpers from '@tests/helpers';
import { VALID_ANTHROPIC_API_KEY } from '@tests/mocks/anthropic/mock-api';
import { VALID_MONOBANK_TOKEN } from '@tests/mocks/monobank/mock-api';

const AI_CONNECTION_MODEL = 'claude-sonnet-5';

describe('Data backup export (POST /user/backup)', () => {
  // The route is rate-limited (5 per 15 min per user) and the limiter runs in
  // the test env. Reset Redis state before each test so accumulated calls from
  // one case don't poison another.
  beforeEach(async () => {
    const userRes = await helpers.makeRequest({ method: 'get', url: '/user', raw: true });
    const userId = (userRes as { id: number }).id;
    await RateLimitService.resetRateLimit(`backup:user:${userId}`);
  });

  describe('Secrets never leak', () => {
    it('strips bank credentials and AI api keys from every file in the zip', async () => {
      // Seed a real bank-provider connection through the public API so the true
      // encryption/storage path runs; its credentials must not travel.
      await helpers.bankDataProviders.connectProvider({
        providerType: BANK_PROVIDER_TYPE.MONOBANK,
        credentials: { apiToken: VALID_MONOBANK_TOKEN },
        raw: true,
      });

      const aiConnection = await helpers.createAiConnection({
        provider: AI_PROVIDER.anthropic,
        name: 'Claude',
        model: AI_CONNECTION_MODEL,
        apiKey: VALID_ANTHROPIC_API_KEY,
        raw: true,
      });
      const [storedConnection] = await helpers.readStoredConnections({ userId: await helpers.getTestUserId() });
      const aiKeyCiphertext = storedConnection!.keyEncrypted!;

      const response = await helpers.exportBackup();
      expect(response.statusCode).toBe(200);
      expect(response.contentType).toBe('application/zip');
      expect(response.filename).toMatch(/^backup-.+-\d{4}-\d{2}-\d{2}\.zip$/);

      const archive = helpers.parseBackupArchive({ buffer: response.body });
      const allText = [...archive.files.values()].map((buf) => buf.toString('utf8')).join('\n');

      // Neither raw secret nor the sensitive column/key names appear anywhere.
      expect(allText).not.toContain(VALID_MONOBANK_TOKEN);
      expect(allText).not.toContain(VALID_ANTHROPIC_API_KEY);
      expect(allText).not.toContain(aiKeyCiphertext);
      expect(allText).not.toMatch(/"keyEncrypted"/);

      // The connection row is kept (accounts keep their linkage) but its
      // credentials are blanked to null.
      const connections = archive.readData({ name: 'bank-data-provider-connections' }) as Array<
        Record<string, unknown>
      >;
      expect(Array.isArray(connections)).toBe(true);
      expect(connections.length).toBeGreaterThan(0);
      for (const connection of connections) {
        expect(connection.credentials).toBeNull();
      }

      // The AI connection travels without its key, flagged so the user is asked to re-enter it.
      const [settingsRow] = archive.readData({ name: 'user-settings' }) as Array<{
        settings: { ai: { connections: Array<Record<string, unknown>> } };
      }>;
      expect(settingsRow!.settings.ai.connections).toEqual([
        expect.objectContaining({
          id: aiConnection.id,
          provider: AI_PROVIDER.anthropic,
          model: AI_CONNECTION_MODEL,
          status: 'invalid',
          lastError: expect.any(String),
          invalidatedAt: expect.any(String),
        }),
      ]);
    });
  });

  describe('Empty state', () => {
    it('a user with no data exports a well-formed zip whose transactional files are empty arrays', async () => {
      const response = await helpers.exportBackup();
      expect(response.statusCode).toBe(200);
      expect(response.contentType).toBe('application/zip');

      const archive = helpers.parseBackupArchive({ buffer: response.body });

      expect(archive.files.has('manifest.json')).toBe(true);
      expect(archive.manifest.formatVersion).toBe(BACKUP_FORMAT_VERSION);
      expect(archive.manifest.user).toEqual({ username: 'test1', email: 'test1@test.local' });
      // Manifest lists a checksum for every data + reference file.
      expect(archive.manifest.files['data/transactions.json']).toBeDefined();
      expect(archive.manifest.files['reference/securities.json']).toBeDefined();

      // A user who created no accounts/transactions/holdings dumps empty arrays
      // for those tables (seeded defaults like categories are a separate case).
      expect(archive.readData({ name: 'transactions' })).toEqual([]);
      expect(archive.readData({ name: 'accounts' })).toEqual([]);
      expect(archive.readData({ name: 'balances' })).toEqual([]);
      expect(archive.readData({ name: 'holdings' })).toEqual([]);
      expect(archive.files.get('reference/securities.json')?.toString('utf8')).toBe('[]');

      // Prices are never exported — derived market data, and dumping them would
      // give a crafted backup a path to poison the global SecurityPricing table.
      expect(archive.files.has('reference/security-pricing.json')).toBe(false);
      expect(archive.manifest.files['reference/security-pricing.json']).toBeUndefined();
    });

    it('rejects an unauthenticated request with 401', async () => {
      const response = await helpers.exportBackup({ withoutAuth: true });
      expect(response.statusCode).toBe(401);
    });
  });
});
