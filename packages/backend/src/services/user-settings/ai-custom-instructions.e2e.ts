import { AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH, AI_PROVIDER } from '@bt/shared/types';
import { encryptToken } from '@common/utils/encryption';
import UserSettings, { DEFAULT_SETTINGS } from '@models/user-settings.model';
import Users from '@models/users.model';
import { app } from '@root/app';
import { API_PREFIX } from '@root/config';
import * as helpers from '@tests/helpers';
import request from 'supertest';

/**
 * Get the test user's numeric ID from the database.
 * The test setup creates a user with username 'test1'.
 */
async function getTestUserId(): Promise<number> {
  const user = await Users.findOne({ where: { username: 'test1' } });
  if (!user) throw new Error('Test user not found');
  return user.id;
}

/**
 * Helper to set up a fake API key in user settings so custom instructions
 * endpoints can pass the "has API key" check without external API validation.
 */
async function setupFakeApiKey({ userId }: { userId: number }) {
  const [settings] = await UserSettings.findOrCreate({
    where: { userId },
    defaults: { settings: DEFAULT_SETTINGS },
  });

  const now = new Date().toISOString();
  settings.settings = {
    ...settings.settings,
    ai: {
      ...(settings.settings.ai ?? { featureConfigs: [] }),
      apiKeys: [
        {
          provider: AI_PROVIDER.openai,
          keyEncrypted: encryptToken('fake-test-key'),
          createdAt: now,
          status: 'valid' as const,
          lastValidatedAt: now,
        },
      ],
    },
  };

  await settings.save();
}

/**
 * Helper to remove all API keys from user settings.
 */
async function removeAllApiKeys({ userId }: { userId: number }) {
  const settings = await UserSettings.findOne({ where: { userId } });
  if (settings) {
    settings.settings = {
      ...settings.settings,
      ai: {
        ...(settings.settings.ai ?? { featureConfigs: [] }),
        apiKeys: [],
      },
    };
    await settings.save();
  }
}

describe('AI Custom Instructions', () => {
  describe('Authentication', () => {
    it('should return 401 for unauthenticated GET request', async () => {
      const response = await request(app).get(`${API_PREFIX}/user/settings/ai/custom-instructions`);

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 for unauthenticated PUT request', async () => {
      const response = await request(app)
        .put(`${API_PREFIX}/user/settings/ai/custom-instructions`)
        .send({ instructions: 'test' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /user/settings/ai/custom-instructions', () => {
    it('should return null when no instructions are set', async () => {
      const response = await helpers.getCustomInstructions({ raw: true });

      expect(response).toEqual({ instructions: null });
    });

    it('should return saved instructions', async () => {
      const userId = await getTestUserId();
      await setupFakeApiKey({ userId });

      await helpers.setCustomInstructions({
        instructions: "Starbucks should be 'Coffee'",
      });

      const response = await helpers.getCustomInstructions({ raw: true });

      expect(response).toEqual({ instructions: "Starbucks should be 'Coffee'" });
    });
  });

  describe('PUT /user/settings/ai/custom-instructions', () => {
    beforeEach(async () => {
      const userId = await getTestUserId();
      await setupFakeApiKey({ userId });
    });

    it('should save custom instructions', async () => {
      const response = await helpers.setCustomInstructions({
        instructions: "Transactions from 'Acme Corp' are freelance income",
      });

      expect(response.statusCode).toBe(200);

      const stored = await helpers.getCustomInstructions({ raw: true });
      expect(stored.instructions).toBe("Transactions from 'Acme Corp' are freelance income");
    });

    it('should clear instructions when saving empty string', async () => {
      await helpers.setCustomInstructions({
        instructions: 'Some instructions',
      });

      const response = await helpers.setCustomInstructions({
        instructions: '',
      });

      expect(response.statusCode).toBe(200);

      const stored = await helpers.getCustomInstructions({ raw: true });
      expect(stored.instructions).toBeNull();
    });

    it('should trim whitespace-only instructions', async () => {
      const response = await helpers.setCustomInstructions({
        instructions: '   ',
      });

      expect(response.statusCode).toBe(200);

      const stored = await helpers.getCustomInstructions({ raw: true });
      expect(stored.instructions).toBeNull();
    });

    it('should reject instructions exceeding max character limit', async () => {
      const longInstructions = 'a'.repeat(AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH + 1);

      const response = await helpers.setCustomInstructions({
        instructions: longInstructions,
        raw: false,
      });

      expect(response.statusCode).toBe(422);
    });

    it('should return 403 when user has no API key', async () => {
      const userId = await getTestUserId();
      await removeAllApiKeys({ userId });

      const response = await helpers.setCustomInstructions({
        instructions: 'Some instructions',
        raw: false,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should accept instructions at exactly the max length', async () => {
      const maxLengthInstructions = 'a'.repeat(AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH);

      const response = await helpers.setCustomInstructions({
        instructions: maxLengthInstructions,
        raw: false,
      });

      expect(response.statusCode).toBe(200);

      const stored = await helpers.getCustomInstructions({ raw: true });
      expect(stored.instructions).toBe(maxLengthInstructions);
    });

    it('should overwrite existing instructions with new value', async () => {
      await helpers.setCustomInstructions({
        instructions: 'First instructions',
      });

      await helpers.setCustomInstructions({
        instructions: 'Updated instructions',
      });

      const stored = await helpers.getCustomInstructions({ raw: true });
      expect(stored.instructions).toBe('Updated instructions');
    });

    it('should preserve instructions when API key is later removed', async () => {
      await helpers.setCustomInstructions({
        instructions: 'My custom rules',
      });

      const userId = await getTestUserId();
      await removeAllApiKeys({ userId });

      const stored = await helpers.getCustomInstructions({ raw: true });
      expect(stored.instructions).toBe('My custom rules');
    });
  });
});
