import { AIApiKeyStatus, AICustomEndpointInfo, AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH } from '@bt/shared/types';
import { decryptToken, encryptToken } from '@common/utils/encryption';
import { t } from '@i18n/index';
import { NotFoundError, ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import UserSettings, {
  DEFAULT_SETTINGS,
  MAX_CUSTOM_ENDPOINTS,
  SettingsSchema,
  StoredAiSettings,
  StoredCustomEndpoint,
} from '@models/user-settings.model';
import { randomUUID } from 'node:crypto';

import { validateCustomEndpoint } from '../ai/custom-endpoint-validation';
import { withTransaction } from '../common/with-transaction';
import { getOrCreateUserSettings } from './get-or-create-user-settings';
import { migrateFeatureConfigsOnCustomEndpointRemoval } from './migrate-feature-configs';

/**
 * Connection details ready to hand to the AI SDK, with `apiKey` decrypted. `hasApiKey` true
 * alongside a null `apiKey` means the stored ciphertext could not be read.
 */
interface CustomEndpointCredentials {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKey: string | null;
  hasApiKey: boolean;
}

const EMPTY_AI_SETTINGS: StoredAiSettings = { apiKeys: [], featureConfigs: [] };

/** Trims and drops trailing slashes so `/v1/` and `/v1` store the same value. */
function normalizeBaseUrl({ baseUrl }: { baseUrl: string }): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function deriveAiSettingsState({ settings }: { settings: SettingsSchema | null | undefined }): {
  currentSettings: SettingsSchema;
  currentAiSettings: StoredAiSettings;
  existingEndpoints: StoredCustomEndpoint[];
} {
  const currentSettings: SettingsSchema = settings ?? DEFAULT_SETTINGS;
  const currentAiSettings = currentSettings.ai ?? EMPTY_AI_SETTINGS;
  const existingEndpoints = currentAiSettings.customEndpoints ?? [];

  return { currentSettings, currentAiSettings, existingEndpoints };
}

async function saveAiSettings({
  userSettings,
  currentSettings,
  currentAiSettings,
  aiPatch,
}: {
  userSettings: UserSettings;
  currentSettings: SettingsSchema;
  currentAiSettings: StoredAiSettings;
  aiPatch: Partial<StoredAiSettings>;
}): Promise<void> {
  userSettings.settings = { ...currentSettings, ai: { ...currentAiSettings, ...aiPatch } };
  await userSettings.save();
}

function decryptOrNull({
  keyEncrypted,
  userId,
  endpointId,
}: {
  keyEncrypted: string | undefined;
  userId: number;
  endpointId: string;
}): string | null {
  if (!keyEncrypted) return null;

  try {
    return decryptToken(keyEncrypted);
  } catch (error) {
    // Ciphertext written under a different APPLICATION_JWT_SECRET, or a mangled settings
    // blob. The user cannot cause or fix either one.
    logger.error(
      { message: 'Stored custom AI endpoint key could not be decrypted', error: error as Error },
      { userId, endpointId },
    );

    return null;
  }
}

/**
 * Refuses to dial an endpoint whose stored key ciphertext cannot be read. Dialling
 * keyless would report an authentication failure against a key the user never touched.
 */
export function assertStoredKeyReadable({ hasApiKey, apiKey }: { hasApiKey: boolean; apiKey: string | null }): void {
  if (hasApiKey && apiKey === null) {
    throw new ValidationError({ message: t({ key: 'ai.customEndpointStoredKeyUnreadable' }) });
  }
}

function toEndpointInfo({ endpoint }: { endpoint: StoredCustomEndpoint }): AICustomEndpointInfo {
  return {
    id: endpoint.id,
    name: endpoint.name,
    baseUrl: endpoint.baseUrl,
    defaultModel: endpoint.defaultModel,
    hasApiKey: Boolean(endpoint.keyEncrypted),
    createdAt: endpoint.createdAt,
    status: endpoint.status,
    lastValidatedAt: endpoint.lastValidatedAt,
    lastError: endpoint.lastError,
    invalidatedAt: endpoint.invalidatedAt,
  };
}

export function readEndpointCredentials({
  endpoint,
  userId,
}: {
  endpoint: StoredCustomEndpoint;
  userId: number;
}): CustomEndpointCredentials {
  return {
    id: endpoint.id,
    name: endpoint.name,
    baseUrl: endpoint.baseUrl,
    defaultModel: endpoint.defaultModel,
    apiKey: decryptOrNull({ keyEncrypted: endpoint.keyEncrypted, userId, endpointId: endpoint.id }),
    hasApiKey: Boolean(endpoint.keyEncrypted),
  };
}

async function readStoredEndpoints({ userId }: { userId: number }): Promise<StoredCustomEndpoint[]> {
  const userSettings = await UserSettings.findOne({ where: { userId }, attributes: ['settings'] });

  return userSettings?.settings?.ai?.customEndpoints ?? [];
}

function assertNameAvailable({
  endpoints,
  name,
  ignoreId,
}: {
  endpoints: StoredCustomEndpoint[];
  name: string;
  ignoreId?: string;
}): void {
  const wanted = name.toLowerCase();
  const taken = endpoints.some(
    (endpoint) => endpoint.name.toLowerCase() === wanted && (ignoreId === undefined || endpoint.id !== ignoreId),
  );

  if (taken) {
    throw new ValidationError({ message: t({ key: 'ai.customEndpointNameTaken' }) });
  }
}

function assertWithinEndpointCap({ endpoints }: { endpoints: StoredCustomEndpoint[] }): void {
  if (endpoints.length >= MAX_CUSTOM_ENDPOINTS) {
    throw new ValidationError({
      message: t({ key: 'ai.customEndpointLimitReached', variables: { max: MAX_CUSTOM_ENDPOINTS } }),
    });
  }
}

function normalizeName({ name }: { name: string }): string {
  const normalized = name.trim();

  if (!normalized || normalized.length > AI_CUSTOM_ENDPOINT_NAME_MAX_LENGTH) {
    throw new ValidationError({ message: t({ key: 'ai.customEndpointNameInvalidLength' }) });
  }

  return normalized;
}

/** Never carries key material. */
export const getCustomEndpointInfos = async ({ userId }: { userId: number }): Promise<AICustomEndpointInfo[]> => {
  const endpoints = await readStoredEndpoints({ userId });
  return endpoints.map((endpoint) => toEndpointInfo({ endpoint }));
};

export const getCustomEndpointById = async ({
  userId,
  endpointId,
}: {
  userId: number;
  endpointId: string;
}): Promise<CustomEndpointCredentials | null> => {
  const endpoints = await readStoredEndpoints({ userId });
  const endpoint = endpoints.find((candidate) => candidate.id === endpointId);

  return endpoint ? readEndpointCredentials({ endpoint, userId }) : null;
};

/** Writes a proven endpoint, re-checking the cap and the name against the locked row. */
const storeNewCustomEndpoint = withTransaction(
  async ({
    userId,
    name,
    baseUrl,
    defaultModel,
    apiKey,
  }: {
    userId: number;
    name: string;
    baseUrl: string;
    defaultModel: string;
    apiKey: string | null;
  }): Promise<AICustomEndpointInfo> => {
    const [userSettings] = await getOrCreateUserSettings({ userId, lock: true });
    const { currentSettings, currentAiSettings, existingEndpoints } = deriveAiSettingsState({
      settings: userSettings.settings,
    });

    assertWithinEndpointCap({ endpoints: existingEndpoints });
    assertNameAvailable({ endpoints: existingEndpoints, name });

    const now = new Date().toISOString();
    const endpoint: StoredCustomEndpoint = {
      id: randomUUID(),
      name,
      baseUrl,
      keyEncrypted: apiKey ? encryptToken(apiKey) : undefined,
      defaultModel,
      createdAt: now,
      status: 'valid' as AIApiKeyStatus,
      lastValidatedAt: now,
      lastError: undefined,
      invalidatedAt: undefined,
    };

    await saveAiSettings({
      userSettings,
      currentSettings,
      currentAiSettings,
      aiPatch: { customEndpoints: [...existingEndpoints, endpoint] },
    });

    return toEndpointInfo({ endpoint });
  },
);

/**
 * Stores the endpoint only after a live call proves the base URL, model and key work. The
 * probe runs before the transaction opens so it does not pin a database connection.
 */
export const createCustomEndpoint = async ({
  userId,
  name,
  baseUrl,
  defaultModel,
  apiKey,
}: {
  userId: number;
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKey?: string | null;
}): Promise<AICustomEndpointInfo> => {
  const normalizedName = normalizeName({ name });
  const normalizedBaseUrl = normalizeBaseUrl({ baseUrl });
  const normalizedModel = defaultModel.trim();

  if (!normalizedBaseUrl || !normalizedModel) {
    throw new ValidationError({ message: t({ key: 'ai.customEndpointMissingFields' }) });
  }

  // Fast fail before spending an outbound call on a request that cannot be saved.
  const storedEndpoints = await readStoredEndpoints({ userId });
  assertWithinEndpointCap({ endpoints: storedEndpoints });
  assertNameAvailable({ endpoints: storedEndpoints, name: normalizedName });

  const effectiveApiKey = apiKey ?? null;

  const validation = await validateCustomEndpoint({
    baseUrl: normalizedBaseUrl,
    modelName: normalizedModel,
    apiKey: effectiveApiKey,
  });

  if (!validation.isValid) {
    throw new ValidationError({ message: validation.error ?? t({ key: 'ai.customEndpointValidationFailed' }) });
  }

  return storeNewCustomEndpoint({
    userId,
    name: normalizedName,
    baseUrl: normalizedBaseUrl,
    defaultModel: normalizedModel,
    apiKey: effectiveApiKey,
  });
};

const storeUpdatedCustomEndpoint = withTransaction(
  async ({
    userId,
    endpointId,
    patch,
  }: {
    userId: number;
    endpointId: string;
    patch: Partial<StoredCustomEndpoint>;
  }): Promise<AICustomEndpointInfo> => {
    const userSettings = await UserSettings.findOne({ where: { userId }, lock: true });
    const { currentSettings, currentAiSettings, existingEndpoints } = deriveAiSettingsState({
      settings: userSettings?.settings,
    });
    const existing = existingEndpoints.find((candidate) => candidate.id === endpointId);

    if (!userSettings || !existing) {
      throw new NotFoundError({ message: t({ key: 'ai.customEndpointNotFound' }) });
    }

    if (patch.name !== undefined) {
      assertNameAvailable({ endpoints: existingEndpoints, name: patch.name, ignoreId: endpointId });
    }

    const updated: StoredCustomEndpoint = { ...existing, ...patch };

    await saveAiSettings({
      userSettings,
      currentSettings,
      currentAiSettings,
      aiPatch: {
        customEndpoints: existingEndpoints.map((candidate) => (candidate.id === endpointId ? updated : candidate)),
      },
    });

    return toEndpointInfo({ endpoint: updated });
  },
);

/**
 * Removing a key is the one change that survives a failed check: it is stored keyless and
 * flagged invalid, because an endpoint that demands a key would reject every attempt to clear
 * it. Every other field is only stored once the new combination answers.
 */
export const updateCustomEndpoint = async ({
  userId,
  endpointId,
  name,
  baseUrl,
  defaultModel,
  apiKey,
}: {
  userId: number;
  endpointId: string;
  name?: string;
  baseUrl?: string;
  defaultModel?: string;
  apiKey?: string | null;
}): Promise<AICustomEndpointInfo> => {
  const storedEndpoints = await readStoredEndpoints({ userId });
  const existing = storedEndpoints.find((candidate) => candidate.id === endpointId);

  if (!existing) {
    throw new NotFoundError({ message: t({ key: 'ai.customEndpointNotFound' }) });
  }

  const normalizedName = name === undefined ? existing.name : normalizeName({ name });
  const normalizedBaseUrl = baseUrl === undefined ? existing.baseUrl : normalizeBaseUrl({ baseUrl });
  const normalizedModel = defaultModel === undefined ? existing.defaultModel : defaultModel.trim();

  if (!normalizedBaseUrl || !normalizedModel) {
    throw new ValidationError({ message: t({ key: 'ai.customEndpointMissingFields' }) });
  }

  assertNameAvailable({ endpoints: storedEndpoints, name: normalizedName, ignoreId: endpointId });

  let keyEncrypted: string | undefined;
  let effectiveApiKey: string | null;
  if (apiKey === undefined) {
    keyEncrypted = existing.keyEncrypted;
    effectiveApiKey = decryptOrNull({ keyEncrypted, userId, endpointId });

    assertStoredKeyReadable({ hasApiKey: Boolean(keyEncrypted), apiKey: effectiveApiKey });
  } else if (apiKey === null) {
    keyEncrypted = undefined;
    effectiveApiKey = null;
  } else {
    keyEncrypted = encryptToken(apiKey);
    effectiveApiKey = apiKey;
  }

  const connectionChanged =
    normalizedBaseUrl !== existing.baseUrl || normalizedModel !== existing.defaultModel || apiKey !== undefined;

  let status = existing.status;
  let lastValidatedAt = existing.lastValidatedAt;
  let lastError = existing.lastError;
  let invalidatedAt = existing.invalidatedAt;

  if (connectionChanged) {
    const validation = await validateCustomEndpoint({
      baseUrl: normalizedBaseUrl,
      modelName: normalizedModel,
      apiKey: effectiveApiKey,
    });

    if (validation.isValid) {
      status = 'valid' as AIApiKeyStatus;
      lastValidatedAt = new Date().toISOString();
      lastError = undefined;
      invalidatedAt = undefined;
    } else if (apiKey === null) {
      status = 'invalid' as AIApiKeyStatus;
      lastError = validation.error ?? t({ key: 'ai.customEndpointValidationFailed' });
      invalidatedAt = new Date().toISOString();
    } else {
      throw new ValidationError({ message: validation.error ?? t({ key: 'ai.customEndpointValidationFailed' }) });
    }
  }

  return storeUpdatedCustomEndpoint({
    userId,
    endpointId,
    patch: {
      name: normalizedName,
      baseUrl: normalizedBaseUrl,
      keyEncrypted,
      defaultModel: normalizedModel,
      status,
      lastValidatedAt,
      lastError,
      invalidatedAt,
    },
  });
};

export const deleteCustomEndpoint = withTransaction(
  async ({ userId, endpointId }: { userId: number; endpointId: string }): Promise<void> => {
    const userSettings = await UserSettings.findOne({ where: { userId }, lock: true });
    if (!userSettings) {
      throw new NotFoundError({ message: t({ key: 'ai.customEndpointNotFound' }) });
    }

    const { currentSettings, currentAiSettings, existingEndpoints } = deriveAiSettingsState({
      settings: userSettings.settings,
    });

    if (!existingEndpoints.some((endpoint) => endpoint.id === endpointId)) {
      throw new NotFoundError({ message: t({ key: 'ai.customEndpointNotFound' }) });
    }

    const featureConfigs = migrateFeatureConfigsOnCustomEndpointRemoval({
      featureConfigs: currentAiSettings.featureConfigs ?? [],
      removedEndpointId: endpointId,
      remainingProviders: (currentAiSettings.apiKeys ?? []).map((key) => key.provider),
    });

    await saveAiSettings({
      userSettings,
      currentSettings,
      currentAiSettings,
      aiPatch: {
        customEndpoints: existingEndpoints.filter((endpoint) => endpoint.id !== endpointId),
        featureConfigs,
      },
    });
  },
);

/**
 * Only an unmodified re-test of a saved endpoint records its verdict on the stored status,
 * because that is the same call real use makes. A request overriding any saved field tried a
 * combination the user never saved, so it leaves the status alone.
 */
export const testCustomEndpointConnection = async ({
  userId,
  endpointId,
  baseUrl,
  defaultModel,
  apiKey,
}: {
  userId: number;
  endpointId?: string;
  baseUrl?: string;
  defaultModel?: string;
  apiKey?: string;
}): Promise<{ isValid: boolean; error?: string }> => {
  const storedEndpoints = endpointId ? await readStoredEndpoints({ userId }) : [];
  const saved = endpointId ? storedEndpoints.find((candidate) => candidate.id === endpointId) : undefined;

  if (endpointId && !saved) {
    throw new NotFoundError({ message: t({ key: 'ai.customEndpointNotFound' }) });
  }

  let savedApiKey: string | null = null;
  if (saved && apiKey === undefined) {
    savedApiKey = decryptOrNull({ keyEncrypted: saved.keyEncrypted, userId, endpointId: saved.id });

    assertStoredKeyReadable({ hasApiKey: Boolean(saved.keyEncrypted), apiKey: savedApiKey });
  }

  const effectiveBaseUrl = normalizeBaseUrl({ baseUrl: baseUrl ?? saved?.baseUrl ?? '' });
  const effectiveModel = (defaultModel ?? saved?.defaultModel ?? '').trim();
  const effectiveApiKey = apiKey ?? savedApiKey;

  if (!effectiveBaseUrl || !effectiveModel) {
    throw new ValidationError({ message: t({ key: 'ai.customEndpointMissingFields' }) });
  }

  const result = await validateCustomEndpoint({
    baseUrl: effectiveBaseUrl,
    modelName: effectiveModel,
    apiKey: effectiveApiKey,
  });

  const overrodeStoredField = baseUrl !== undefined || defaultModel !== undefined || apiKey !== undefined;

  if (saved && !overrodeStoredField) {
    if (result.isValid) {
      await markCustomEndpointValid({ userId, endpointId: saved.id });
    } else {
      await markCustomEndpointInvalid({
        userId,
        endpointId: saved.id,
        errorMessage: result.error ?? t({ key: 'ai.customEndpointValidationFailed' }),
      });
    }
  }

  return result;
};

const patchEndpointStatus = async ({
  userId,
  endpointId,
  patch,
}: {
  userId: number;
  endpointId: string;
  patch: Partial<StoredCustomEndpoint>;
}): Promise<void> => {
  const userSettings = await UserSettings.findOne({ where: { userId }, lock: true });
  if (!userSettings) {
    logger.info('Skipping custom AI endpoint status patch: the user has no settings row', { userId, endpointId });
    return;
  }

  const { currentSettings, currentAiSettings, existingEndpoints } = deriveAiSettingsState({
    settings: userSettings.settings,
  });
  if (!existingEndpoints.some((endpoint) => endpoint.id === endpointId)) {
    logger.info('Skipping custom AI endpoint status patch: the endpoint is no longer stored', { userId, endpointId });
    return;
  }

  await saveAiSettings({
    userSettings,
    currentSettings,
    currentAiSettings,
    aiPatch: {
      customEndpoints: existingEndpoints.map((endpoint) =>
        endpoint.id === endpointId ? { ...endpoint, ...patch } : endpoint,
      ),
    },
  });
};

export const markCustomEndpointInvalid = withTransaction(
  async ({
    userId,
    endpointId,
    errorMessage,
  }: {
    userId: number;
    endpointId: string;
    errorMessage: string;
  }): Promise<void> => {
    await patchEndpointStatus({
      userId,
      endpointId,
      patch: {
        status: 'invalid' as AIApiKeyStatus,
        lastError: errorMessage,
        invalidatedAt: new Date().toISOString(),
      },
    });
  },
);

export const markCustomEndpointValid = withTransaction(
  async ({ userId, endpointId }: { userId: number; endpointId: string }): Promise<void> => {
    await patchEndpointStatus({
      userId,
      endpointId,
      patch: {
        status: 'valid' as AIApiKeyStatus,
        lastValidatedAt: new Date().toISOString(),
        lastError: undefined,
        invalidatedAt: undefined,
      },
    });
  },
);
