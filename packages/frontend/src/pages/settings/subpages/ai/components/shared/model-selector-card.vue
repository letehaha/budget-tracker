<template>
  <Collapsible v-slot="{ open }" :default-open="defaultOpen" class="@container/feature-header rounded-lg border">
    <!-- Collapsible Header -->
    <CollapsibleTrigger class="flex w-full items-center gap-3 p-4 text-left">
      <ChevronRightIcon class="size-4 shrink-0 transition-transform" :class="{ 'rotate-90': open }" />
      <div class="min-w-0 flex-1">
        <!-- Title row with badge on mobile -->
        <div class="flex items-center gap-2">
          <component :is="featureIcon" class="text-muted-foreground size-4 shrink-0" />
          <h4 class="font-medium">{{ t(featureDisplayInfo.nameKey) }}</h4>
          <!-- Key source badge - inline on mobile -->
          <Tooltip.TooltipProvider>
            <Tooltip.Tooltip>
              <Tooltip.TooltipTrigger as-child @click.stop>
                <span
                  v-if="featureStatus.usingUserKey"
                  class="inline-flex cursor-help items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs whitespace-nowrap text-green-700 sm:hidden dark:bg-green-900 dark:text-green-300"
                >
                  {{ $t('settings.ai.modelSelector.badges.yourKey') }}
                  <InfoIcon class="size-3" />
                </span>
                <span
                  v-else
                  class="inline-flex cursor-help items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs whitespace-nowrap text-blue-700 sm:hidden dark:bg-blue-900 dark:text-blue-300"
                >
                  {{ $t('settings.ai.modelSelector.badges.server') }}
                  <InfoIcon class="size-3" />
                </span>
              </Tooltip.TooltipTrigger>
              <Tooltip.TooltipContent class="max-w-70 p-3">
                <p class="text-sm">
                  {{
                    featureStatus.usingUserKey
                      ? $t('settings.ai.modelSelector.badges.yourKeyTooltip')
                      : $t('settings.ai.modelSelector.badges.serverTooltip')
                  }}
                </p>
              </Tooltip.TooltipContent>
            </Tooltip.Tooltip>
          </Tooltip.TooltipProvider>
        </div>
        <p class="text-muted-foreground text-sm">
          {{ t(featureDisplayInfo.descriptionKey) }}
        </p>
      </div>

      <!-- Status badges on desktop (right side) -->
      <div class="hidden shrink-0 items-center gap-2 sm:flex">
        <!-- Model name (only when collapsed) -->
        <span v-if="!open && collapsedModelLabel" class="text-muted-foreground max-w-60 truncate text-xs">
          {{ collapsedModelLabel }}
        </span>
        <!-- Key source badge -->
        <Tooltip.TooltipProvider>
          <Tooltip.Tooltip>
            <Tooltip.TooltipTrigger as-child @click.stop>
              <span
                v-if="featureStatus.usingUserKey"
                class="inline-flex cursor-help items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs whitespace-nowrap text-green-700 dark:bg-green-900 dark:text-green-300"
              >
                {{ $t('settings.ai.modelSelector.badges.yourKey') }}
                <InfoIcon class="size-3" />
              </span>
              <span
                v-else
                class="inline-flex cursor-help items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs whitespace-nowrap text-blue-700 dark:bg-blue-900 dark:text-blue-300"
              >
                {{ $t('settings.ai.modelSelector.badges.server') }}
                <InfoIcon class="size-3" />
              </span>
            </Tooltip.TooltipTrigger>
            <Tooltip.TooltipContent class="max-w-70 p-3">
              <p class="text-sm">
                {{
                  featureStatus.usingUserKey
                    ? $t('settings.ai.modelSelector.badges.yourKeyTooltip')
                    : $t('settings.ai.modelSelector.badges.serverTooltip')
                }}
              </p>
            </Tooltip.TooltipContent>
          </Tooltip.Tooltip>
        </Tooltip.TooltipProvider>
      </div>
    </CollapsibleTrigger>

    <CollapsibleContent>
      <div class="border-t px-4 pt-4 pb-4">
        <!-- Slot for feature-specific content (e.g., model hint) -->
        <slot name="before-selector" />

        <!-- Model selector -->
        <div class="flex items-end gap-3">
          <div class="flex-1">
            <label class="mb-1.5 block text-sm font-medium">{{ $t('settings.ai.modelSelector.modelLabel') }}</label>
            <div class="relative">
              <select
                :value="selectValue"
                class="bg-background w-full appearance-none rounded-md border py-2 pr-9 pl-3"
                :disabled="isUpdating"
                @change="handleSelectChange(($event.target as HTMLSelectElement).value)"
              >
                <optgroup v-for="group in groupedModels" :key="group.provider" :label="getGroupLabel(group.provider)">
                  <option
                    v-for="model in group.models"
                    :key="model.id"
                    :value="model.id"
                    :disabled="!hasUserKey(model.provider)"
                  >
                    {{ model.name }} - {{ getCostLabel(model.costTier) }}

                    <template v-if="!hasUserKey(model.provider)">
                      {{ $t('settings.ai.modelSelector.noApiKey') }}
                    </template>
                  </option>
                </optgroup>

                <optgroup v-for="option in customEndpointOptions" :key="option.id" :label="option.name">
                  <option :value="encodeCustomEndpointOption({ endpointId: option.id })">
                    {{
                      $t('settings.ai.modelSelector.customModel.endpointOption', {
                        endpoint: option.name,
                        model: option.model,
                      })
                    }}
                  </option>
                </optgroup>
              </select>
              <ChevronDownIcon
                class="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
              />
            </div>
          </div>

          <Button v-if="featureStatus.isConfigured" variant="outline" :disabled="isResetting" @click="handleReset">
            {{ $t('settings.ai.modelSelector.resetButton') }}
          </Button>
        </div>

        <CustomModelField
          v-if="selectedCustomEndpoint"
          v-model="customModelName"
          class="mt-3"
          :endpoint="selectedCustomEndpoint"
          :saved-model-name="savedCustomModelName"
          :is-applying="isUpdating"
          :error-message="applyModelError"
          @apply="handleApplyCustomModel"
        />

        <!-- The select still names the endpoint from the feature status, so it looks fine
        while the endpoint list is missing and the model name cannot be edited. -->
        <p v-else-if="selectedCustomEndpointId && isCustomEndpointsError" class="text-destructive-text mt-3 text-xs">
          {{ $t('settings.ai.modelSelector.customModel.endpointsLoadError') }}
          <Button
            type="button"
            variant="link"
            size="sm"
            class="h-auto p-0 text-xs"
            :disabled="isFetchingCustomEndpoints"
            @click="refetchCustomEndpoints()"
          >
            {{ $t('settings.ai.customEndpoint.loadError.retry') }}
          </Button>
        </p>

        <!-- Add API key hint for model selection -->
        <p v-if="!featureStatus.usingUserKey" class="text-warning-text mt-2 text-xs">
          {{ $t('settings.ai.modelSelector.addKeyHint') }}
          <router-link :to="{ name: ROUTES_NAMES.settingsAiKeys }" class="text-primary-text hover:underline">
            {{ $t('settings.ai.modelSelector.addKeyHintLink') }}
          </router-link>
        </p>

        <!-- Model info -->
        <div v-if="selectedModel" class="bg-muted/50 mt-3 rounded-md p-3">
          <div class="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>{{ selectedModel.description }}</span>
            <span class="flex items-center gap-1">
              <span class="font-medium">{{ $t('settings.ai.modelSelector.modelInfo.context') }}</span>
              {{ formatContextWindow(selectedModel.contextWindow) }}
            </span>
            <span class="flex items-center gap-1">
              <span class="font-medium">{{ $t('settings.ai.modelSelector.modelInfo.capabilities') }}</span>
              {{ formatCapabilities(selectedModel.capabilities) }}
            </span>
            <span v-if="formattedPrice" class="flex items-center gap-1">
              <span class="font-medium">{{ $t('settings.ai.modelSelector.modelInfo.estimatedCost') }}</span>
              {{ formattedPrice }} {{ $t('settings.ai.modelSelector.modelInfo.per100Transactions') }}
            </span>
          </div>
        </div>

        <!-- Server-provided rate limiting warning -->
        <Callout v-if="!featureStatus.usingUserKey" variant="warning" class="mt-3 text-xs" icon-size-class="size-3.5">
          {{ $t('settings.ai.modelSelector.rateLimitWarning') }}
        </Callout>

        <!-- Slot for feature-specific content after the card (e.g., "How it works") -->
        <slot name="after-card" />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>

<script setup lang="ts">
import { getAIFeatureDisplayInfo } from '@/common/const';
import { Button } from '@/components/lib/ui/button';
import { Callout } from '@/components/lib/ui/callout';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import * as Tooltip from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { useAiCustomEndpointsList } from '@/composable/data-queries/use-ai-custom-endpoints';
import { type ModelGroup } from '@/composable/data-queries/use-feature-models';
import { extractApiErrorMessage } from '@/js/errors';
import { ROUTES_NAMES } from '@/routes';
import {
  AIFeatureStatus,
  AIKeyProvider,
  AIModelCapability,
  AIModelCostTier,
  AIModelInfoWithRecommendation,
  AIModelPricing,
  AI_FEATURE,
  AI_PROVIDER,
  buildCustomModelId,
  isCustomModelId,
} from '@bt/shared/types';
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon, InfoIcon, LineChartIcon, TagIcon } from '@lucide/vue';
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import {
  buildCustomEndpointOptions,
  decodeCustomEndpointOption,
  encodeCustomEndpointOption,
  readStoredSelectValue,
  resolveCustomModelName,
} from './custom-endpoint-selection';
import CustomModelField from './custom-model-field.vue';

const props = defineProps<{
  featureStatus: AIFeatureStatus;
  groupedModels: ModelGroup[];
  availableModels: AIModelInfoWithRecommendation[];
  tokensPerTransaction?: { input: number; output: number };
  defaultOpen?: boolean;
}>();

const featureDisplayInfo = computed(() => getAIFeatureDisplayInfo({ feature: props.featureStatus.feature }));

const FEATURE_ICONS = {
  [AI_FEATURE.categorization]: TagIcon,
  [AI_FEATURE.statementParsing]: FileTextIcon,
  [AI_FEATURE.investmentTransactionsParsing]: LineChartIcon,
} as const;

const featureIcon = computed(() => FEATURE_ICONS[props.featureStatus.feature]);

const { t } = useI18n();

// Catalog groups only. A custom endpoint's optgroup uses the endpoint's own name.
const PROVIDER_LABELS = computed<Record<AIKeyProvider, string>>(() => ({
  [AI_PROVIDER.openai]: t('settings.ai.modelSelector.groupLabels.openai'),
  [AI_PROVIDER.anthropic]: t('settings.ai.modelSelector.groupLabels.anthropic'),
  [AI_PROVIDER.google]: t('settings.ai.modelSelector.groupLabels.google'),
  [AI_PROVIDER.groq]: t('settings.ai.modelSelector.groupLabels.groq'),
  [AI_PROVIDER.openrouter]: t('settings.ai.modelSelector.groupLabels.openrouter'),
}));

const COST_LABELS = computed<Record<AIModelCostTier, string>>(() => ({
  free: t('settings.ai.modelSelector.costLabels.free'),
  low: t('settings.ai.modelSelector.costLabels.low'),
  medium: t('settings.ai.modelSelector.costLabels.medium'),
  high: t('settings.ai.modelSelector.costLabels.high'),
}));

const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
const {
  configuredProviders,
  setFeatureConfig,
  isSettingFeatureConfig: isUpdating,
  resetFeatureConfig,
  isResettingFeatureConfig: isResetting,
} = useAiSettings();

const { customEndpoints, isCustomEndpointsError, isFetchingCustomEndpoints, refetchCustomEndpoints } =
  useAiCustomEndpointsList();

/**
 * What the `<select>` shows. Owned here rather than derived from the props, so a pick the
 * server refuses can be moved back.
 */
const selectValue = ref(readStoredSelectValue({ status: props.featureStatus }));

const customModelName = ref(
  isCustomModelId({ modelId: props.featureStatus.modelId }) ? props.featureStatus.modelName : '',
);

/** Why the endpoint refused the typed model. Shown under the field it is about. */
const applyModelError = ref<string | null>(null);

/** Endpoint the selection points at, or `null` while it names a catalog model. */
const selectedCustomEndpointId = computed(() => decodeCustomEndpointOption({ value: selectValue.value }));

/**
 * Puts the dropdown back on the stored pick. The optimistic value has to render first:
 * set and unset within one tick and `selectValue` never changes, so the browser keeps
 * showing the refused choice.
 */
const restoreStoredSelection = async () => {
  await nextTick();
  selectValue.value = readStoredSelectValue({ status: props.featureStatus });
};

watch(
  () => props.featureStatus,
  (status) => {
    selectValue.value = readStoredSelectValue({ status });
    if (isCustomModelId({ modelId: status.modelId })) {
      customModelName.value = status.modelName;
    }
  },
);

// The message is about one model on one endpoint, so any change makes it stale.
watch([customModelName, selectedCustomEndpointId], () => {
  applyModelError.value = null;
});

/** The stored endpoint backing the current selection, once the list has loaded. */
const selectedCustomEndpoint = computed(
  () => customEndpoints.value.find((endpoint) => endpoint.id === selectedCustomEndpointId.value) ?? null,
);

/**
 * Stored model name, but only while the select points at the endpoint it is stored on.
 * Empty otherwise, so the dropdown shows a name only after the server accepts it.
 */
const savedCustomModelName = computed(() =>
  isCustomModelId({ modelId: props.featureStatus.modelId }) &&
  props.featureStatus.customEndpointId === selectedCustomEndpointId.value
    ? props.featureStatus.modelName
    : '',
);

// Feature status supplies the endpoint label while the endpoints query is still loading.
const customEndpointOptions = computed(() =>
  buildCustomEndpointOptions({
    endpoints: customEndpoints.value,
    selectedEndpointId: selectedCustomEndpointId.value,
    savedModelName: savedCustomModelName.value,
    fallbackEndpointName:
      props.featureStatus.endpointName ?? t('settings.ai.modelSelector.customModel.unknownEndpoint'),
  }),
);

const userProviders = computed(() => new Set<AIKeyProvider>(configuredProviders.value.map((p) => p.provider)));
const hasUserKey = (provider: AIKeyProvider) => userProviders.value.has(provider);

const selectedModel = computed(() => {
  return props.availableModels.find((m) => m.id === props.featureStatus.modelId);
});

/** Collapsed-header summary. Custom models are not in the catalog, so they show their endpoint. */
const collapsedModelLabel = computed(() => {
  if (!isCustomModelId({ modelId: props.featureStatus.modelId })) {
    return selectedModel.value?.name ?? '';
  }

  const model = props.featureStatus.modelName;
  const endpoint = selectedCustomEndpoint.value?.name ?? props.featureStatus.endpointName;
  return endpoint ? t('settings.ai.modelSelector.customModel.endpointOption', { endpoint, model }) : model;
});

const getGroupLabel = (provider: AIKeyProvider | 'recommended') => {
  if (provider === 'recommended') {
    return t('settings.ai.modelSelector.groupLabels.recommended');
  }
  return PROVIDER_LABELS.value[provider] ?? provider;
};

const getCostLabel = (tier: AIModelCostTier) => COST_LABELS.value[tier] ?? tier;

const formatContextWindow = (tokens: number) => {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M tokens`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(0)}K tokens`;
  }
  return `${tokens} tokens`;
};

const formatCapabilities = (capabilities: AIModelCapability[]) => {
  const labels: Record<AIModelCapability, string> = {
    'text-generation': t('settings.ai.modelSelector.capabilities.textGeneration'),
    'structured-output': t('settings.ai.modelSelector.capabilities.structuredOutput'),
    'function-calling': t('settings.ai.modelSelector.capabilities.functionCalling'),
    vision: t('settings.ai.modelSelector.capabilities.vision'),
    'fast-inference': t('settings.ai.modelSelector.capabilities.fastInference'),
    agents: t('settings.ai.modelSelector.capabilities.agents'),
  };
  return capabilities.map((c) => labels[c] ?? c).join(', ');
};

const formatPricePer100 = (pricing: AIModelPricing | undefined): string | null => {
  if (!pricing) return null;

  const tokens = props.tokensPerTransaction ?? { input: 250, output: 30 };
  const inputCost = (tokens.input * 100 * pricing.inputPerMillion) / 1_000_000;
  const outputCost = (tokens.output * 100 * pricing.outputPerMillion) / 1_000_000;
  const totalCost = inputCost + outputCost;

  if (totalCost < 0.001) {
    return '<$0.001';
  }
  if (totalCost < 0.01) {
    return `~$${totalCost.toFixed(4)}`;
  }
  return `~$${totalCost.toFixed(3)}`;
};

const formattedPrice = computed(() => formatPricePer100(selectedModel.value?.pricing));

/** Saves the pick and returns why the server refused it, or `null` once it is stored. */
const handleModelChange = async ({
  modelId,
  customEndpointId,
}: {
  modelId: string;
  customEndpointId?: string;
}): Promise<string | null> => {
  try {
    await setFeatureConfig({ feature: props.featureStatus.feature, modelId, customEndpointId });
    applyModelError.value = null;
    addSuccessNotification(t('settings.ai.modelSelector.notifications.updateSuccess'));
    return null;
  } catch (error) {
    await restoreStoredSelection();
    return extractApiErrorMessage(error) ?? t('settings.ai.modelSelector.notifications.updateFailed');
  }
};

const handleSelectChange = async (value: string) => {
  // Moved before the request so the dropdown answers the click; a refusal moves it back.
  selectValue.value = value;

  const endpointId = decodeCustomEndpointOption({ value });
  if (endpointId === null) {
    const failure = await handleModelChange({ modelId: value });
    if (failure) addErrorNotification(failure);
    return;
  }

  const endpoint = customEndpoints.value.find((item) => item.id === endpointId);

  // Picking an endpoint stores its default model right away, so the feature works immediately.
  const modelName = resolveCustomModelName({
    endpointDefaultModel: endpoint?.defaultModel,
    typedModelName: customModelName.value,
  });
  if (!modelName) {
    addErrorNotification(t('settings.ai.modelSelector.customModel.missingModelName'));
    await restoreStoredSelection();
    return;
  }

  customModelName.value = modelName;
  const failure = await handleModelChange({ modelId: buildCustomModelId({ modelName }), customEndpointId: endpointId });
  if (failure) addErrorNotification(failure);
};

const handleApplyCustomModel = async ({ modelName }: { modelName: string }) => {
  const endpointId = selectedCustomEndpointId.value;
  if (!endpointId) return;

  applyModelError.value = await handleModelChange({
    modelId: buildCustomModelId({ modelName }),
    customEndpointId: endpointId,
  });
};

const handleReset = async () => {
  try {
    await resetFeatureConfig({ feature: props.featureStatus.feature });
    addSuccessNotification(t('settings.ai.modelSelector.notifications.resetSuccess'));
  } catch (error) {
    addErrorNotification(extractApiErrorMessage(error) ?? t('settings.ai.modelSelector.notifications.resetFailed'));
  }
};
</script>
