<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h3 class="text-lg font-medium">API Keys</h3>
        <p class="text-muted-foreground text-sm">Add your own API keys to use specific providers</p>
      </div>
    </div>

    <!-- Configured providers list -->
    <div v-if="sortedConfiguredProviders.length > 0" class="space-y-3">
      <div
        v-for="providerInfo in sortedConfiguredProviders"
        :key="providerInfo.provider"
        class="rounded-lg border p-3"
        :class="{ 'border-destructive/50 bg-destructive/5': providerInfo.status === 'invalid' }"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <!-- Status icon -->
            <CheckCircleIcon v-if="providerInfo.status !== 'invalid'" class="h-5 w-5 text-green-600" />
            <AlertCircleIcon v-else class="text-destructive-text h-5 w-5" />

            <div>
              <div class="font-medium">
                {{ getProviderLabel(providerInfo.provider) }}
                <span
                  v-if="providerInfo.provider === defaultProvider"
                  class="bg-primary/10 text-primary ml-2 rounded-full px-2 py-0.5 text-xs"
                >
                  Default
                </span>
                <span
                  v-if="providerInfo.status === 'invalid'"
                  class="bg-destructive/10 text-destructive-text ml-2 rounded-full px-2 py-0.5 text-xs"
                >
                  Invalid
                </span>
              </div>
              <div class="text-muted-foreground text-xs">
                <template v-if="providerInfo.status === 'invalid'">
                  Failed {{ formatRelativeDate(new Date(providerInfo.invalidatedAt!)) }}
                </template>
                <template v-else> Validated {{ formatRelativeDate(new Date(providerInfo.lastValidatedAt)) }} </template>
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
              variant="ghost-destructive"
              :disabled="isDeletingKey"
              @click="openDeleteConfirmation(providerInfo.provider)"
            >
              <Trash2Icon class="size-4" />
            </Button>
          </div>
        </div>

        <!-- Error message for invalid keys -->
        <div v-if="providerInfo.status === 'invalid' && providerInfo.lastError" class="mt-2">
          <p class="text-destructive-text text-sm">{{ providerInfo.lastError }}</p>
          <p class="text-muted-foreground mt-1 text-xs">
            Add a new key below to replace this one, or remove it if you no longer need it.
          </p>
        </div>
      </div>
    </div>

    <!-- Delete confirmation dialog -->
    <AlertDialog v-model:open="deleteDialogState.isOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove API key?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove the {{ deleteDialogState.providerLabel }} API key?
            <template v-if="configuredProviders.length > 1">
              AI features currently using {{ deleteDialogState.providerLabel }} will switch to another available
              provider.
            </template>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="confirmDeleteKey">Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Add new key form -->
    <div class="rounded-lg border p-4">
      <!-- All providers configured state -->
      <template v-if="availableProvidersToAdd.length === 0">
        <div class="text-muted-foreground flex items-center gap-3">
          <CheckCircleIcon class="h-5 w-5 text-green-600" />
          <p class="text-sm">All providers are set up</p>
        </div>
      </template>

      <!-- Add key form -->
      <template v-else>
        <h4 class="mb-4 font-medium">
          {{ configuredProviders.length > 0 ? 'Add Another Provider' : 'Add API Key' }}
        </h4>

        <form class="flex flex-col gap-4" @submit.prevent="handleSaveKey">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">Provider</label>
            <div class="relative">
              <select
                v-model="selectedProvider"
                class="bg-background w-full appearance-none rounded-md border py-2 pr-9 pl-3"
                @change="validationError = ''"
              >
                <option v-for="provider in availableProvidersToAdd" :key="provider.value" :value="provider.value">
                  {{ provider.label }}
                </option>
              </select>
              <ChevronDownIcon
                class="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
              />
            </div>
            <p class="text-muted-foreground text-xs">
              {{ getProviderDescription(selectedProvider) }}
            </p>
          </div>

          <InputField
            v-model="apiKeyInput"
            label="API Key"
            :placeholder="getProviderPlaceholder(selectedProvider)"
            :error-message="validationError"
            @update:model-value="validationError = ''"
          />

          <div class="flex gap-2">
            <Button type="submit" :disabled="!apiKeyInput.trim() || isSettingKey">
              <template v-if="isSettingKey">
                <Loader2Icon class="mr-2 h-4 w-4 animate-spin" />
                Validating...
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
  </div>
</template>

<script setup lang="ts">
import InputField from '@/components/fields/input-field.vue';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/lib/ui/alert-dialog';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { ApiErrorResponseError } from '@/js/errors';
import { AI_PROVIDER } from '@bt/shared/types';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircleIcon, CheckCircleIcon, ChevronDownIcon, KeyIcon, Loader2Icon, Trash2Icon } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';

const PROVIDER_CONFIG: Record<AI_PROVIDER, { label: string; placeholder: string; description: string }> = {
  [AI_PROVIDER.anthropic]: {
    label: 'Anthropic (Claude)',
    placeholder: 'sk-ant-...',
    description: 'Get your API key from console.anthropic.com/settings/keys',
  },
  [AI_PROVIDER.openai]: {
    label: 'OpenAI (GPT)',
    placeholder: 'sk-...',
    description: 'Get your API key from platform.openai.com/api-keys',
  },
  [AI_PROVIDER.google]: {
    label: 'Google (Gemini)',
    placeholder: 'AIza...',
    description: 'Get your API key from aistudio.google.com/apikey',
  },
  [AI_PROVIDER.groq]: {
    label: 'Groq (Llama, Mixtral)',
    placeholder: 'gsk_...',
    description: 'Get your API key from console.groq.com/keys',
  },
};

const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
const {
  configuredProviders,
  defaultProvider,
  setApiKey,
  isSettingApiKey: isSettingKey,
  deleteApiKey,
  isDeletingApiKey: isDeletingKey,
  setDefaultProvider,
  isSettingDefaultProvider: isSettingDefault,
} = useAiSettings();

const apiKeyInput = ref('');
const selectedProvider = ref<AI_PROVIDER>(AI_PROVIDER.openai);
const validationError = ref('');
const deleteDialogState = reactive<{
  isOpen: boolean;
  provider: AI_PROVIDER | null;
  providerLabel: string;
}>({
  isOpen: false,
  provider: null,
  providerLabel: '',
});

const availableProvidersToAdd = computed(() => {
  const configuredSet = new Set(configuredProviders.value.map((p) => p.provider));
  return Object.values(AI_PROVIDER)
    .filter((p) => !configuredSet.has(p))
    .map((p) => ({ value: p, label: PROVIDER_CONFIG[p].label }));
});

/** Sorted providers: default first, then alphabetically by label */
const sortedConfiguredProviders = computed(() => {
  return [...configuredProviders.value].sort((a, b) => {
    // Default provider always first
    if (a.provider === defaultProvider.value) return -1;
    if (b.provider === defaultProvider.value) return 1;
    // Sort rest alphabetically by label
    const labelA = PROVIDER_CONFIG[a.provider]?.label ?? a.provider;
    const labelB = PROVIDER_CONFIG[b.provider]?.label ?? b.provider;
    return labelA.localeCompare(labelB);
  });
});

const getProviderLabel = (provider: AI_PROVIDER) => PROVIDER_CONFIG[provider]?.label ?? provider;
const getProviderPlaceholder = (provider: AI_PROVIDER) => PROVIDER_CONFIG[provider]?.placeholder ?? '';
const getProviderDescription = (provider: AI_PROVIDER) => PROVIDER_CONFIG[provider]?.description ?? '';

const formatRelativeDate = (date: Date) => formatDistanceToNow(date, { addSuffix: true });

const handleSaveKey = async () => {
  const trimmedKey = apiKeyInput.value.trim();
  if (!trimmedKey) return;

  // Clear any previous validation error
  validationError.value = '';

  try {
    await setApiKey({ apiKey: trimmedKey, provider: selectedProvider.value });
    apiKeyInput.value = '';
    addSuccessNotification('API key saved and validated successfully');

    // Select next available provider if there's one
    if (availableProvidersToAdd.value.length > 0) {
      selectedProvider.value = availableProvidersToAdd.value[0].value;
    }
  } catch (error) {
    // Show the validation error message inline below the input field
    validationError.value =
      error instanceof ApiErrorResponseError
        ? error.data.message
        : 'API key is not working. Please verify the key is correct, has sufficient credits, and has the required permissions.';
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

const openDeleteConfirmation = (provider: AI_PROVIDER) => {
  deleteDialogState.provider = provider;
  deleteDialogState.providerLabel = getProviderLabel(provider);
  deleteDialogState.isOpen = true;
};

const confirmDeleteKey = async () => {
  if (!deleteDialogState.provider) return;

  const provider = deleteDialogState.provider;
  const providerLabel = deleteDialogState.providerLabel;

  try {
    await deleteApiKey({ provider });
    addSuccessNotification(`${providerLabel} API key removed`);
  } catch {
    addErrorNotification('Failed to remove API key');
  }
};
</script>
