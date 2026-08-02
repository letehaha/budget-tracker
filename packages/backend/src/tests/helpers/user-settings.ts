import {
  AICustomEndpointInfo,
  AIFeatureStatus,
  AIKeyProvider,
  AI_FEATURE,
  WipeDataSharedResources,
} from '@bt/shared/types';
import { encryptToken } from '@common/utils/encryption';
import UserSettings, { DEFAULT_SETTINGS } from '@models/user-settings.model';
import Users from '@models/users.model';
import { getUserSettings as apiGetUserSettings } from '@root/services/user-settings/get-user-settings';
import {
  getOnboardingState as apiGetOnboardingState,
  updateOnboardingState as apiUpdateOnboardingState,
} from '@root/services/user-settings/onboarding';
import { patchUserSettings as apiPatchUserSettings } from '@root/services/user-settings/patch-settings';
import { updateUserSettings as apiUpdateUserSettings } from '@root/services/user-settings/update-settings';
import {
  CUSTOM_ENDPOINT_BASE_URL,
  CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
  CUSTOM_ENDPOINT_MODEL,
} from '@tests/mocks/openai-compatible/mock-api';

import { CustomResponse, makeRequest } from './common';

export async function getUserSettings<R extends boolean | undefined = undefined>({ raw }: { raw?: R }) {
  return makeRequest<Awaited<ReturnType<typeof apiGetUserSettings>>, R>({
    method: 'get',
    url: '/user/settings',
    raw,
  });
}

export async function updateUserSettings<R extends boolean | undefined = undefined>({
  raw,
  ...payload
}: Omit<Parameters<typeof apiUpdateUserSettings>[0], 'userId'> & {
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiUpdateUserSettings>>, R>({
    method: 'put',
    url: '/user/settings',
    payload: payload.settings,
    raw,
  });
}

export async function patchUserSettings<R extends boolean | undefined = undefined>({
  raw,
  patch,
}: {
  patch: Record<string, unknown>;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiPatchUserSettings>>, R>({
    method: 'patch',
    url: '/user/settings',
    payload: patch,
    raw,
  });
}

export async function getOnboarding<R extends boolean | undefined = undefined>({ raw }: { raw?: R }) {
  return makeRequest<Awaited<ReturnType<typeof apiGetOnboardingState>>, R>({
    method: 'get',
    url: '/user/settings/onboarding',
    raw,
  });
}

export async function updateOnboarding<R extends boolean | undefined = undefined>({
  raw,
  onboardingState,
}: {
  onboardingState: Omit<Parameters<typeof apiUpdateOnboardingState>[0], 'userId'>['onboardingState'];
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiUpdateOnboardingState>>, R>({
    method: 'put',
    url: '/user/settings/onboarding',
    payload: onboardingState,
    raw,
  });
}

export async function deleteUserAccount(): Promise<CustomResponse<void>> {
  return makeRequest<void>({
    method: 'delete',
    url: '/user/delete',
  });
}

/**
 * Returns the raw envelope so callers can assert on `statusCode`, `body.response.code`,
 * and `body.response.details` — needed for the 409 sharing-acknowledgement branch.
 */
export async function wipeUserData({
  acknowledgeSharing,
}: {
  acknowledgeSharing?: boolean;
} = {}): Promise<
  CustomResponse<{
    code?: string;
    message?: string;
    details?: { sharedResources?: WipeDataSharedResources };
  }>
> {
  return makeRequest({
    method: 'post',
    url: '/user/wipe-data',
    payload: { acknowledgeSharing: acknowledgeSharing ?? false },
  });
}

// AI API Key helpers. `provider` stays `AIKeyProvider`: a test proving the route refuses
// `custom` casts at its own call site instead of widening this type.

interface AiApiKeyInfo {
  provider: AIKeyProvider;
  createdAt: string;
}

export async function getAiApiKeyStatus<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<{ hasApiKey: boolean; providers: AiApiKeyInfo[]; defaultProvider: AIKeyProvider | null }, R>({
    method: 'get',
    url: '/user/settings/ai/api-keys',
    raw,
  });
}

export async function setAiApiKey<R extends boolean | undefined = undefined>({
  apiKey,
  provider,
  raw,
}: {
  apiKey: string;
  provider: AIKeyProvider;
  raw?: R;
}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'put',
    url: '/user/settings/ai/api-keys',
    payload: { apiKey, provider },
    raw,
  });
}

export async function deleteAiApiKey<R extends boolean | undefined = undefined>({
  provider,
  raw,
}: {
  provider: AIKeyProvider;
  raw?: R;
}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'delete',
    url: '/user/settings/ai/api-keys',
    payload: { provider },
    raw,
  });
}

export async function setDefaultAiProvider<R extends boolean | undefined = undefined>({
  provider,
  raw,
}: {
  provider: AIKeyProvider;
  raw?: R;
}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'put',
    url: '/user/settings/ai/api-keys/default',
    payload: { provider },
    raw,
  });
}

export async function deleteAllAiApiKeys<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'delete',
    url: '/user/settings/ai/api-keys/all',
    raw,
  });
}

// AI Custom Endpoint helpers

export async function getAiCustomEndpoints<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<AICustomEndpointInfo[], R>({
    method: 'get',
    url: '/user/settings/ai/custom-endpoints',
    raw,
  });
}

export async function createAiCustomEndpoint<R extends boolean | undefined = undefined>({
  name,
  baseUrl,
  defaultModel,
  apiKey,
  raw,
}: {
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKey?: string | null;
  raw?: R;
}) {
  return makeRequest<AICustomEndpointInfo, R>({
    method: 'post',
    url: '/user/settings/ai/custom-endpoints',
    payload: { name, baseUrl, defaultModel, apiKey },
    raw,
  });
}

/**
 * Omitted fields keep their stored value. For `apiKey`: omit it to keep the stored key,
 * pass null to remove it, pass a string to replace it.
 */
export async function updateAiCustomEndpoint<R extends boolean | undefined = undefined>({
  id,
  name,
  baseUrl,
  defaultModel,
  apiKey,
  raw,
}: {
  id: string;
  name?: string;
  baseUrl?: string;
  defaultModel?: string;
  apiKey?: string | null;
  raw?: R;
}) {
  return makeRequest<AICustomEndpointInfo, R>({
    method: 'put',
    url: `/user/settings/ai/custom-endpoints/${id}`,
    payload: { name, baseUrl, defaultModel, apiKey },
    raw,
  });
}

export async function deleteAiCustomEndpoint<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: string;
  raw?: R;
}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'delete',
    url: `/user/settings/ai/custom-endpoints/${id}`,
    raw,
  });
}

/** With `endpointId` every omitted field falls back to that saved endpoint, including its key. */
export async function testAiCustomEndpoint<R extends boolean | undefined = undefined>({
  endpointId,
  baseUrl,
  defaultModel,
  apiKey,
  raw,
}: {
  endpointId?: string;
  baseUrl?: string;
  defaultModel?: string;
  apiKey?: string;
  raw?: R;
} = {}) {
  return makeRequest<{ isValid: boolean; error?: string }, R>({
    method: 'post',
    url: '/user/settings/ai/custom-endpoints/test',
    payload: { endpointId, baseUrl, defaultModel, apiKey },
    raw,
  });
}

// AI Feature configuration helpers

export async function getAiFeaturesStatus<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<{ features: AIFeatureStatus[] }, R>({
    method: 'get',
    url: '/user/settings/ai/features',
    raw,
  });
}

export async function getAiFeatureConfig<R extends boolean | undefined = undefined>({
  feature,
  raw,
}: {
  feature: AI_FEATURE;
  raw?: R;
}) {
  return makeRequest<AIFeatureStatus, R>({
    method: 'get',
    url: `/user/settings/ai/features/${feature}`,
    raw,
  });
}

/** `customEndpointId` is required alongside a `custom/*` model ID and ignored otherwise. */
export async function setAiFeatureConfig<R extends boolean | undefined = undefined>({
  feature,
  modelId,
  customEndpointId,
  raw,
}: {
  feature: AI_FEATURE;
  modelId: string;
  customEndpointId?: string;
  raw?: R;
}) {
  return makeRequest<AIFeatureStatus, R>({
    method: 'put',
    url: `/user/settings/ai/features/${feature}`,
    payload: { modelId, customEndpointId },
    raw,
  });
}

// AI Custom Instructions helpers

export async function getCustomInstructions<R extends boolean | undefined = undefined>({ raw }: { raw?: R }) {
  return makeRequest<{ instructions: string | null }, R>({
    method: 'get',
    url: '/user/settings/ai/custom-instructions',
    raw,
  });
}

export async function setCustomInstructions<R extends boolean | undefined = undefined>({
  instructions,
  raw,
}: {
  instructions: string;
  raw?: R;
}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'put',
    url: '/user/settings/ai/custom-instructions',
    payload: { instructions },
    raw,
  });
}

// AI settings fixtures: shared setup and stored-state reads for the AI e2e suites

/** The seeded user every e2e case authenticates as. */
export async function getTestUserId(): Promise<number> {
  const user = await Users.findOne({ where: { username: 'test1' } });
  if (!user) throw new Error('Test user not found');
  return user.id;
}

/**
 * Writes an API key straight into settings, bypassing the HTTP route, which validates the
 * key against the live provider.
 */
export async function seedApiKey({ userId, provider }: { userId: number; provider: AIKeyProvider }): Promise<void> {
  const [settings] = await UserSettings.findOrCreate({
    where: { userId },
    defaults: { settings: DEFAULT_SETTINGS },
  });

  const now = new Date().toISOString();
  settings.settings = {
    ...settings.settings,
    ai: {
      ...(settings.settings.ai ?? { apiKeys: [], featureConfigs: [] }),
      apiKeys: [
        {
          provider,
          keyEncrypted: encryptToken('seeded-provider-key'),
          createdAt: now,
          status: 'valid' as const,
          lastValidatedAt: now,
        },
      ],
    },
  };

  await settings.save();
}

export async function readStoredEndpoints({ userId }: { userId: number }) {
  const settings = await UserSettings.findOne({ where: { userId } });
  return settings?.settings?.ai?.customEndpoints ?? [];
}

export async function readStoredFeatureConfigs({ userId }: { userId: number }) {
  const settings = await UserSettings.findOne({ where: { userId } });
  return settings?.settings?.ai?.featureConfigs ?? [];
}

export const FIRST_ENDPOINT_NAME = 'Home Ollama';
export const SECOND_ENDPOINT_NAME = 'Studio vLLM';
export const SECOND_ENDPOINT_MODEL = 'qwen2.5';

/** Both endpoints answer through msw. The caller picks self-host or cloud mode first. */
export async function createFirstEndpoint({ apiKey }: { apiKey?: string | null } = {}) {
  return createAiCustomEndpoint({
    name: FIRST_ENDPOINT_NAME,
    baseUrl: CUSTOM_ENDPOINT_BASE_URL,
    defaultModel: CUSTOM_ENDPOINT_MODEL,
    apiKey,
    raw: true,
  });
}

export async function createSecondEndpoint({ apiKey }: { apiKey?: string | null } = {}) {
  return createAiCustomEndpoint({
    name: SECOND_ENDPOINT_NAME,
    baseUrl: CUSTOM_ENDPOINT_LOOPBACK_BASE_URL,
    defaultModel: SECOND_ENDPOINT_MODEL,
    apiKey,
    raw: true,
  });
}

/** The typed helpers describe success bodies only, so an error message needs its own read. */
export function errorMessage({ response }: { response: { body: unknown } }): string | undefined {
  return (response.body as { response?: { message?: string } }).response?.message;
}
