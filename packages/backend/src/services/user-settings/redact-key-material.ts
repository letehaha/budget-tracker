import { type SettingsSchema, type StoredAiSettings, type StoredConnection } from '@models/user-settings.model';
import omit from 'lodash/omit';

type RedactedAiSettings = Omit<StoredAiSettings, 'connections'> & {
  connections?: Omit<StoredConnection, 'keyEncrypted'>[];
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
      ...omit(ai, 'connections', 'apiKeys', 'customEndpoints'),
      ...(ai.connections
        ? { connections: ai.connections.map((connection) => omit(connection, ['keyEncrypted'])) }
        : {}),
    },
  };
};
