import { AIConnectionInfo, AI_PROVIDER } from '@bt/shared/types';

export type AiConnectionPresetId = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'ollama' | 'lmStudio' | 'custom';

export interface AiConnectionPreset {
  id: AiConnectionPresetId;
  provider: AI_PROVIDER;
  labelKey: string;
  namePlaceholderKey: string;
  /** Prefilled into the editable base URL field; only `custom` presets have one. */
  baseUrl?: string;
  keyUrl?: string;
  keyRequired: boolean;
  /** Runs on the user's machine, which only a self-hosted backend can reach. */
  isLocal?: boolean;
}

export const AI_CONNECTION_PRESETS: AiConnectionPreset[] = [
  {
    id: 'openai',
    provider: AI_PROVIDER.openai,
    labelKey: 'settings.ai.connections.presets.openai.label',
    namePlaceholderKey: 'settings.ai.connections.presets.openai.namePlaceholder',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyRequired: true,
  },
  {
    id: 'anthropic',
    provider: AI_PROVIDER.anthropic,
    labelKey: 'settings.ai.connections.presets.anthropic.label',
    namePlaceholderKey: 'settings.ai.connections.presets.anthropic.namePlaceholder',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyRequired: true,
  },
  {
    id: 'google',
    provider: AI_PROVIDER.google,
    labelKey: 'settings.ai.connections.presets.google.label',
    namePlaceholderKey: 'settings.ai.connections.presets.google.namePlaceholder',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyRequired: true,
  },
  {
    id: 'openrouter',
    provider: AI_PROVIDER.custom,
    labelKey: 'settings.ai.connections.presets.openrouter.label',
    namePlaceholderKey: 'settings.ai.connections.presets.openrouter.namePlaceholder',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    keyRequired: true,
  },
  {
    id: 'ollama',
    provider: AI_PROVIDER.custom,
    labelKey: 'settings.ai.connections.presets.ollama.label',
    namePlaceholderKey: 'settings.ai.connections.presets.ollama.namePlaceholder',
    baseUrl: 'http://localhost:11434/v1',
    keyRequired: false,
    isLocal: true,
  },
  {
    id: 'lmStudio',
    provider: AI_PROVIDER.custom,
    labelKey: 'settings.ai.connections.presets.lmStudio.label',
    namePlaceholderKey: 'settings.ai.connections.presets.lmStudio.namePlaceholder',
    baseUrl: 'http://localhost:1234/v1',
    keyRequired: false,
    isLocal: true,
  },
  {
    id: 'custom',
    provider: AI_PROVIDER.custom,
    labelKey: 'settings.ai.connections.presets.custom.label',
    namePlaceholderKey: 'settings.ai.connections.presets.custom.namePlaceholder',
    keyRequired: false,
  },
];

const CUSTOM_PRESET = AI_CONNECTION_PRESETS.find((preset) => preset.id === 'custom')!;

const normalizeBaseUrl = ({ baseUrl }: { baseUrl: string }) =>
  baseUrl.trim().toLowerCase().replace(/\/+$/, '').replace('://127.0.0.1', '://localhost');

/** The quick-fill preset a custom base URL came from; loopback spellings count as the same host. */
export const matchPresetByBaseUrl = ({ baseUrl }: { baseUrl: string }): AiConnectionPreset | null => {
  const normalized = normalizeBaseUrl({ baseUrl });
  return (
    AI_CONNECTION_PRESETS.find(
      (preset) => preset.baseUrl !== undefined && normalizeBaseUrl({ baseUrl: preset.baseUrl }) === normalized,
    ) ?? null
  );
};

export const findPresetForConnection = ({
  connection,
}: {
  connection: Pick<AIConnectionInfo, 'provider' | 'baseUrl'>;
}): AiConnectionPreset => {
  if (connection.provider !== AI_PROVIDER.custom) {
    return AI_CONNECTION_PRESETS.find((preset) => preset.provider === connection.provider) ?? CUSTOM_PRESET;
  }
  return (connection.baseUrl && matchPresetByBaseUrl({ baseUrl: connection.baseUrl })) || CUSTOM_PRESET;
};
