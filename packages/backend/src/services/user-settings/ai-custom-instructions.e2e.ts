import { AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH, AI_PROVIDER } from '@bt/shared/types';
import { beforeEach, describe, expect, it } from '@jest/globals';
import UserSettings from '@models/user-settings.model';
import { app } from '@root/app';
import { API_PREFIX } from '@root/config';
import * as helpers from '@tests/helpers';
import { getTestUserId, seedApiKey } from '@tests/helpers/user-settings';
import request from 'supertest';

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
    it('should return 401 for unauthenticated requests', async () => {
      const getResponse = await request(app).get(`${API_PREFIX}/user/settings/ai/custom-instructions`);
      expect(getResponse.statusCode).toBe(401);

      const putResponse = await request(app)
        .put(`${API_PREFIX}/user/settings/ai/custom-instructions`)
        .send({ instructions: 'test' });
      expect(putResponse.statusCode).toBe(401);
    });
  });

  describe('GET /user/settings/ai/custom-instructions', () => {
    it('should return null when no instructions are set', async () => {
      const response = await helpers.getCustomInstructions({ raw: true });

      expect(response).toEqual({ instructions: null });
    });
  });

  describe('PUT /user/settings/ai/custom-instructions', () => {
    beforeEach(async () => {
      const userId = await getTestUserId();
      await seedApiKey({ userId, provider: AI_PROVIDER.openai });
    });

    it('should save custom instructions and overwrite them with a new value', async () => {
      const response = await helpers.setCustomInstructions({
        instructions: "Transactions from 'Acme Corp' are freelance income",
      });

      expect(response.statusCode).toBe(200);

      const stored = await helpers.getCustomInstructions({ raw: true });
      expect(stored.instructions).toBe("Transactions from 'Acme Corp' are freelance income");

      await helpers.setCustomInstructions({ instructions: 'Updated instructions' });

      const overwritten = await helpers.getCustomInstructions({ raw: true });
      expect(overwritten.instructions).toBe('Updated instructions');
    });

    it('should clear instructions for an empty or whitespace-only value', async () => {
      await helpers.setCustomInstructions({ instructions: 'Some instructions' });

      const cleared = await helpers.setCustomInstructions({ instructions: '' });
      expect(cleared.statusCode).toBe(200);
      expect((await helpers.getCustomInstructions({ raw: true })).instructions).toBeNull();

      await helpers.setCustomInstructions({ instructions: 'Some instructions' });

      const trimmed = await helpers.setCustomInstructions({ instructions: '   ' });
      expect(trimmed.statusCode).toBe(200);
      expect((await helpers.getCustomInstructions({ raw: true })).instructions).toBeNull();
    });

    it('should accept instructions at exactly the max length and reject anything longer', async () => {
      const tooLong = await helpers.setCustomInstructions({
        instructions: 'a'.repeat(AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH + 1),
        raw: false,
      });
      expect(tooLong.statusCode).toBe(422);

      const maxLengthInstructions = 'a'.repeat(AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH);
      const atMax = await helpers.setCustomInstructions({ instructions: maxLengthInstructions, raw: false });
      expect(atMax.statusCode).toBe(200);

      const stored = await helpers.getCustomInstructions({ raw: true });
      expect(stored.instructions).toBe(maxLengthInstructions);
    });

    it('should preserve stored instructions when the API key is removed, but refuse new ones', async () => {
      await helpers.setCustomInstructions({ instructions: 'My custom rules' });

      await removeAllApiKeys({ userId: await getTestUserId() });

      const stored = await helpers.getCustomInstructions({ raw: true });
      expect(stored.instructions).toBe('My custom rules');

      const response = await helpers.setCustomInstructions({ instructions: 'Some instructions', raw: false });
      expect(response.statusCode).toBe(403);
    });
  });
});
