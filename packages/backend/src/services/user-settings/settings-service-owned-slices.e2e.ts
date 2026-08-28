import { AI_PROVIDER } from '@bt/shared/types';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { encryptToken } from '@common/utils/encryption';
import { describe, expect, it } from '@jest/globals';
import UserSettings, { DEFAULT_SETTINGS } from '@models/user-settings.model';
import * as helpers from '@tests/helpers';
import { getTestUserId, readStoredEndpoints } from '@tests/helpers/user-settings';

const SEEDED_ENDPOINT_NAME = 'Home Ollama';
/** Link-local metadata address that the outbound URL guard rejects. */
const SMUGGLED_BASE_URL = 'http://169.254.169.254';

/**
 * Writes an endpoint straight into settings, the state a create through the dedicated route
 * leaves behind, encrypted key included. Returns the stored ciphertext because `encryptToken`
 * uses a random IV, so a caller cannot recompute it.
 */
async function seedCustomEndpoint({ userId }: { userId: number }): Promise<string> {
  const [settings] = await UserSettings.findOrCreate({
    where: { userId },
    defaults: { settings: DEFAULT_SETTINGS },
  });

  const now = new Date().toISOString();
  const keyEncrypted = encryptToken('seeded-endpoint-key');

  settings.settings = {
    ...settings.settings,
    ai: {
      ...(settings.settings.ai ?? { apiKeys: [], featureConfigs: [] }),
      customEndpoints: [
        {
          id: generateRandomRecordId(),
          name: SEEDED_ENDPOINT_NAME,
          baseUrl: 'https://llm.example.com/v1',
          keyEncrypted,
          defaultModel: 'llama3',
          createdAt: now,
          status: 'valid' as const,
          lastValidatedAt: now,
        },
      ],
    },
  };

  await settings.save();

  return keyEncrypted;
}

/** Shaped like a stored endpoint, with a base URL the outbound guard rejects and an id no route can match. */
function buildSmuggledEndpoint() {
  const now = new Date().toISOString();

  return {
    id: 'smuggled-not-a-uuid',
    name: 'Metadata',
    baseUrl: SMUGGLED_BASE_URL,
    defaultModel: 'gpt-4o-mini',
    createdAt: now,
    status: 'valid' as const,
    lastValidatedAt: now,
  };
}

/** PUT with a body the typed helper cannot express, because the contract leaves these slices out. */
function putRawSettings({ settings }: { settings: Record<string, unknown> }) {
  return helpers.makeRequest({ method: 'put', url: '/user/settings', payload: settings });
}

/** Every `keyEncrypted` found anywhere in a response body, at any depth. */
function collectKeyMaterial({ value }: { value: unknown }): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectKeyMaterial({ value: item }));

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, nested]) =>
      key === 'keyEncrypted' ? [String(nested)] : collectKeyMaterial({ value: nested }),
    );
  }

  return [];
}

describe('Settings slices owned by their own endpoints', () => {
  describe('PUT /user/settings', () => {
    it('ignores a smuggled ai.customEndpoints array', async () => {
      // A settings row already exists, so this exercises the merge branch.
      await helpers.updateUserSettings({ raw: true, settings: { locale: 'en' } });

      const response = await putRawSettings({
        settings: {
          locale: 'uk',
          includeCreditLimitInStats: true,
          ai: { customEndpoints: [buildSmuggledEndpoint()] },
        },
      });
      expect(response.statusCode).toBe(200);

      const stored = await readStoredEndpoints({ userId: await getTestUserId() });
      expect(stored).toHaveLength(0);

      const listed = await helpers.getAiCustomEndpoints({ raw: true });
      expect(listed).toHaveLength(0);

      const fetched = await helpers.getUserSettings({ raw: true });
      expect(fetched.locale).toBe('uk');
      expect(fetched.includeCreditLimitInStats).toBe(true);
    });

    it('ignores a smuggled ai.customEndpoints array on the very first write', async () => {
      // The first write seeds the row straight from the payload, a separate branch from the merge.
      const response = await putRawSettings({
        settings: { locale: 'en', ai: { customEndpoints: [buildSmuggledEndpoint()] } },
      });
      expect(response.statusCode).toBe(200);

      const stored = await readStoredEndpoints({ userId: await getTestUserId() });
      expect(stored).toHaveLength(0);

      const listed = await helpers.getAiCustomEndpoints({ raw: true });
      expect(listed).toHaveLength(0);
    });

    it('keeps every service-owned slice when the client sends settings back', async () => {
      // The wipe scenario: a page reads settings, changes one field and sends the whole cached object back.
      const userId = await getTestUserId();
      await helpers.seedApiKey({ userId, provider: AI_PROVIDER.openai });
      const keyEncrypted = await seedCustomEndpoint({ userId });
      await helpers.updateOnboarding({ raw: true, onboardingState: { isDismissed: true } });

      const fetched = await helpers.getUserSettings({ raw: true });
      const response = await putRawSettings({
        settings: {
          ...fetched,
          locale: 'uk',
          onboarding: { completedTasks: [], isDismissed: false, dismissedAt: null },
        },
      });
      expect(response.statusCode).toBe(200);

      const stored = await readStoredEndpoints({ userId });
      expect(stored).toHaveLength(1);
      expect(stored[0]!.name).toBe(SEEDED_ENDPOINT_NAME);
      expect(stored[0]!.keyEncrypted).toBe(keyEncrypted);

      const listed = await helpers.getAiCustomEndpoints({ raw: true });
      expect(listed).toHaveLength(1);
      expect(listed[0]!.name).toBe(SEEDED_ENDPOINT_NAME);
      expect(listed[0]!.hasApiKey).toBe(true);

      const status = await helpers.getAiApiKeyStatus({ raw: true });
      expect(status.hasApiKey).toBe(true);
      expect(status.providers.map((entry) => entry.provider)).toContain(AI_PROVIDER.openai);

      const onboarding = await helpers.getOnboarding({ raw: true });
      expect(onboarding.isDismissed).toBe(true);

      const reFetched = await helpers.getUserSettings({ raw: true });
      expect(reFetched.locale).toBe('uk');

      const updated = await helpers.updateUserSettings({
        raw: true,
        settings: {
          locale: 'en',
          ai: { featureConfigs: [], customInstructions: 'Prefer concise answers' },
        },
      });

      expect(updated.ai?.customInstructions).toBe('Prefer concise answers');
      expect(updated.ai?.customEndpoints).toHaveLength(1);

      const afterSiblingUpdate = await helpers.getUserSettings({ raw: true });
      expect(afterSiblingUpdate.ai?.customInstructions).toBe('Prefer concise answers');

      const storedAfterSiblingUpdate = await readStoredEndpoints({ userId });
      expect(storedAfterSiblingUpdate).toHaveLength(1);
      expect(storedAfterSiblingUpdate[0]!.name).toBe(SEEDED_ENDPOINT_NAME);
    }, 30_000);

    it('rejects a payload that is invalid outside the ignored slices', async () => {
      const response = await putRawSettings({ settings: { locale: 'klingon' } });

      expect(response.statusCode).toBe(422);
    });
  });

  describe('GET /user/settings', () => {
    it('returns no encrypted key material anywhere', async () => {
      const userId = await getTestUserId();
      await helpers.seedApiKey({ userId, provider: AI_PROVIDER.openai });
      const keyEncrypted = await seedCustomEndpoint({ userId });

      const fetched = await helpers.getUserSettings({ raw: true });

      // Both slices come back, so an empty scan isn't just the slices being missing.
      expect(fetched.ai?.apiKeys).toHaveLength(1);
      expect(fetched.ai?.customEndpoints).toHaveLength(1);
      expect(collectKeyMaterial({ value: fetched })).toHaveLength(0);

      const stored = await readStoredEndpoints({ userId });
      expect(stored[0]!.keyEncrypted).toBe(keyEncrypted);
    });

    it('returns no encrypted key material for a user who never stored any', async () => {
      const fetched = await helpers.getUserSettings({ raw: true });

      expect(collectKeyMaterial({ value: fetched })).toHaveLength(0);
    });
  });

  describe('PATCH /user/settings', () => {
    it('never writes ai.customEndpoints, whatever the rest of the patch does', async () => {
      const userId = await getTestUserId();

      const response = await helpers.patchUserSettings({
        patch: {
          includeCreditLimitInStats: true,
          ai: { customEndpoints: [buildSmuggledEndpoint()] },
        },
      });
      expect(response.statusCode).toBe(200);

      const patched = response.body.response;
      expect(patched.includeCreditLimitInStats).toBe(true);
      expect(patched.ai?.customEndpoints ?? []).toHaveLength(0);
      expect(await helpers.getAiCustomEndpoints({ raw: true })).toHaveLength(0);
      expect(await readStoredEndpoints({ userId })).toHaveLength(0);

      await seedCustomEndpoint({ userId });

      const replaceAttempt = await helpers.patchUserSettings({
        patch: { ai: { customEndpoints: [buildSmuggledEndpoint()] } },
      });
      expect(replaceAttempt.statusCode).toBe(200);

      const stored = await readStoredEndpoints({ userId });
      expect(stored).toHaveLength(1);
      expect(stored[0]!.name).toBe(SEEDED_ENDPOINT_NAME);
      expect(stored.some((endpoint) => endpoint.baseUrl === SMUGGLED_BASE_URL)).toBe(false);

      const listed = await helpers.getAiCustomEndpoints({ raw: true });
      expect(listed).toHaveLength(1);
      expect(listed[0]!.name).toBe(SEEDED_ENDPOINT_NAME);

      const withSiblingKey = await helpers.patchUserSettings({
        raw: true,
        patch: { ai: { customInstructions: 'Prefer concise answers' } },
      });
      expect(withSiblingKey.ai?.customInstructions).toBe('Prefer concise answers');
      expect(withSiblingKey.ai?.customEndpoints).toHaveLength(1);

      const storedAfterSiblingPatch = await readStoredEndpoints({ userId });
      expect(storedAfterSiblingPatch).toHaveLength(1);
      expect(storedAfterSiblingPatch[0]!.name).toBe(SEEDED_ENDPOINT_NAME);
    }, 30_000);
  });
});
