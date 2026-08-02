import { type SettingsSchema } from '@models/user-settings.model';
import omit from 'lodash/omit';

type StoredAiSettings = NonNullable<SettingsSchema['ai']>;
type RedactedAiApiKey = Omit<StoredAiSettings['apiKeys'][number], 'keyEncrypted'>;
type RedactedAiCustomEndpoint = Omit<NonNullable<StoredAiSettings['customEndpoints']>[number], 'keyEncrypted'>;

type RedactedAiSettings = Omit<StoredAiSettings, 'apiKeys' | 'customEndpoints'> & {
  apiKeys?: RedactedAiApiKey[];
  customEndpoints?: RedactedAiCustomEndpoint[];
};

/** Settings without any stored ciphertext, the shape the settings endpoints return. */
export type RedactedSettingsSchema = Omit<SettingsSchema, 'ai'> & { ai?: RedactedAiSettings };

/**
 * Drops the encrypted key material before settings leave the server. The ciphertext is only
 * ever decrypted server-side when dialling a provider, so no response needs to carry it.
 * Stored settings are untouched.
 */
export const redactKeyMaterial = ({ settings }: { settings: SettingsSchema }): RedactedSettingsSchema => {
  const { ai, ...rest } = settings;

  if (!ai) return rest;

  return {
    ...rest,
    ai: {
      ...omit(ai, ['apiKeys', 'customEndpoints']),
      ...(ai.apiKeys ? { apiKeys: ai.apiKeys.map((key) => omit(key, ['keyEncrypted'])) } : {}),
      ...(ai.customEndpoints
        ? { customEndpoints: ai.customEndpoints.map((endpoint) => omit(endpoint, ['keyEncrypted'])) }
        : {}),
    },
  };
};
