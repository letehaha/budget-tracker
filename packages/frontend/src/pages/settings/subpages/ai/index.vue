<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">AI Settings</h2>
      <p class="text-sm opacity-80">Configure AI-powered features like automatic transaction categorization</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <div>
        <h3 class="mb-2 text-lg font-medium">AI Provider API Keys</h3>
        <p class="mb-4 text-sm leading-relaxed">
          To enable AI-powered transaction categorization, provide your API key for one of the supported providers. Your
          keys are encrypted and stored securely.
        </p>

        <div v-if="isLoadingStatus" class="flex items-center gap-2 text-sm opacity-70">
          <Loader2Icon class="h-4 w-4 animate-spin" />
          Loading...
        </div>

        <template v-else>
          <!-- Configured providers list -->
          <div v-if="configuredProviders.length > 0" class="mb-6 space-y-3">
            <div
              v-for="providerInfo in configuredProviders"
              :key="providerInfo.provider"
              class="flex items-center justify-between rounded-lg border p-3"
            >
              <div class="flex items-center gap-3">
                <CheckCircleIcon class="h-5 w-5 text-green-600" />
                <div>
                  <div class="font-medium">
                    {{ getProviderLabel(providerInfo.provider) }}
                    <span
                      v-if="providerInfo.provider === defaultProvider"
                      class="bg-primary/10 text-primary ml-2 rounded-full px-2 py-0.5 text-xs"
                    >
                      Default
                    </span>
                  </div>
                  <div class="text-xs opacity-60">
                    Added {{ formatDate(new Date(providerInfo.createdAt), 'MMM dd, yyyy') }}
                  </div>
                </div>
              </div>
              <div class="flex gap-2">
                <Button
                  v-if="providerInfo.provider !== defaultProvider && configuredProviders.length > 1"
                  size="sm"
                  variant="outline"
                  :disabled="isSettingDefault"
                  @click="handleSetDefault(providerInfo.provider)"
                >
                  Set as Default
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  :disabled="isDeletingKey"
                  @click="handleDeleteKey(providerInfo.provider)"
                >
                  <Trash2Icon class="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <!-- Add new provider -->
          <form class="flex flex-col gap-4 rounded-lg border p-4" @submit.prevent="handleSaveKey">
            <h4 class="font-medium">
              {{ configuredProviders.length > 0 ? 'Add Another Provider' : 'Add API Key' }}
            </h4>

            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium">Provider</label>
              <select v-model="selectedProvider" class="bg-background rounded-md border px-3 py-2">
                <option v-for="provider in availableProviders" :key="provider.value" :value="provider.value">
                  {{ provider.label }}
                </option>
              </select>
              <p class="text-xs opacity-60">
                {{ getProviderDescription(selectedProvider) }}
              </p>
            </div>

            <InputField
              v-model="apiKeyInput"
              label="API Key"
              :placeholder="getProviderPlaceholder(selectedProvider)"
              type="password"
            />

            <div class="flex gap-2">
              <Button type="submit" :disabled="!apiKeyInput.trim() || isSettingKey">
                <template v-if="isSettingKey">
                  <Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </template>
                <template v-else>
                  <KeyIcon class="mr-2 h-4 w-4" />
                  Save Key
                </template>
              </Button>
            </div>
          </form>
        </template>
      </div>

      <div class="border-t pt-6">
        <h3 class="mb-2 text-lg font-medium">How it works</h3>
        <ul class="list-disc space-y-2 pl-5 text-sm leading-relaxed opacity-80">
          <li>
            When you sync transactions from your bank (Monobank, EnableBanking), uncategorized transactions are
            automatically sent to AI for categorization.
          </li>
          <li>
            The AI analyzes transaction descriptions and merchant names to suggest appropriate categories from your
            existing category list.
          </li>
          <li>You can always manually override AI-suggested categories.</li>
          <li>API costs are billed directly to your provider account based on usage.</li>
        </ul>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import InputField from '@/components/fields/input-field.vue';
import { Button } from '@/components/lib/ui/button';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { useNotificationCenter } from '@/components/notification-center';
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { AI_PROVIDER } from '@bt/shared/types';
import { format as formatDate } from 'date-fns';
import { CheckCircleIcon, KeyIcon, Loader2Icon, Trash2Icon } from 'lucide-vue-next';
import { computed, ref } from 'vue';

defineOptions({
  name: 'settings-ai',
});

const PROVIDER_CONFIG = {
  [AI_PROVIDER.anthropic]: {
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    description: 'Get your API key from console.anthropic.com/settings/keys',
  },
  [AI_PROVIDER.openai]: {
    label: 'OpenAI (GPT)',
    placeholder: 'sk-...',
    description: 'Get your API key from platform.openai.com/api-keys (coming soon)',
  },
  [AI_PROVIDER.google]: {
    label: 'Google (Gemini)',
    placeholder: 'AIza...',
    description: 'Get your API key from aistudio.google.com/apikey (coming soon)',
  },
};

const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
const {
  aiApiKeyStatus,
  isLoadingStatus,
  setApiKey,
  isSettingKey,
  setDefaultProvider,
  isSettingDefault,
  deleteApiKey,
  isDeletingKey,
} = useAiSettings();

const apiKeyInput = ref('');
const selectedProvider = ref<AI_PROVIDER>(AI_PROVIDER.anthropic);

const configuredProviders = computed(() => aiApiKeyStatus.value?.providers ?? []);
const defaultProvider = computed(() => aiApiKeyStatus.value?.defaultProvider);

// Currently only Anthropic is implemented
const availableProviders = computed(() => [
  { value: AI_PROVIDER.anthropic, label: PROVIDER_CONFIG[AI_PROVIDER.anthropic].label },
  // Uncomment when implemented:
  // { value: AI_PROVIDER.openai, label: PROVIDER_CONFIG[AI_PROVIDER.openai].label },
  // { value: AI_PROVIDER.google, label: PROVIDER_CONFIG[AI_PROVIDER.google].label },
]);

const getProviderLabel = (provider: AI_PROVIDER) => PROVIDER_CONFIG[provider]?.label ?? provider;
const getProviderPlaceholder = (provider: AI_PROVIDER) => PROVIDER_CONFIG[provider]?.placeholder ?? '';
const getProviderDescription = (provider: AI_PROVIDER) => PROVIDER_CONFIG[provider]?.description ?? '';

const handleSaveKey = async () => {
  const trimmedKey = apiKeyInput.value.trim();
  if (!trimmedKey) return;

  try {
    await setApiKey({ apiKey: trimmedKey, provider: selectedProvider.value });
    apiKeyInput.value = '';
    addSuccessNotification('API key saved successfully');
  } catch {
    addErrorNotification('Failed to save API key');
  }
};

const handleSetDefault = async (provider: AI_PROVIDER) => {
  try {
    await setDefaultProvider({ provider });
    addSuccessNotification(`${getProviderLabel(provider)} set as default`);
  } catch {
    addErrorNotification('Failed to set default provider');
  }
};

const handleDeleteKey = async (provider: AI_PROVIDER) => {
  try {
    await deleteApiKey({ provider });
    addSuccessNotification(`${getProviderLabel(provider)} API key removed`);
  } catch {
    addErrorNotification('Failed to remove API key');
  }
};
</script>
