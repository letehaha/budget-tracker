<template>
  <Collapsible v-slot="{ open }" :default-open="defaultOpen" class="@container/feature-header rounded-lg border">
    <!-- Collapsible Header -->
    <CollapsibleTrigger class="flex w-full items-center gap-3 p-4 text-left">
      <ChevronRightIcon class="size-4 shrink-0 transition-transform" :class="{ 'rotate-90': open }" />
      <div class="min-w-0 flex-1">
        <!-- Title row with badge on mobile -->
        <div class="flex items-center gap-2">
          <component :is="featureIcon" class="text-muted-foreground size-4 shrink-0" />
          <h4 class="font-medium">{{ featureDisplayInfo.name }}</h4>
          <!-- Key source badge - inline on mobile -->
          <span
            v-if="featureStatus.usingUserKey"
            class="rounded-full bg-green-100 px-2 py-0.5 text-xs whitespace-nowrap text-green-700 sm:hidden dark:bg-green-900 dark:text-green-300"
          >
            Your key
          </span>
          <span
            v-else
            class="rounded-full bg-blue-100 px-2 py-0.5 text-xs whitespace-nowrap text-blue-700 sm:hidden dark:bg-blue-900 dark:text-blue-300"
          >
            Server
          </span>
        </div>
        <p class="text-muted-foreground text-sm">
          {{ featureDisplayInfo.description }}
        </p>
      </div>

      <!-- Status badges on desktop (right side) -->
      <div class="hidden shrink-0 items-center gap-2 sm:flex">
        <!-- Model name (only when collapsed) -->
        <span v-if="!open && selectedModel" class="text-muted-foreground text-xs">
          {{ selectedModel.name }}
        </span>
        <!-- Key source badge -->
        <span
          v-if="featureStatus.usingUserKey"
          class="rounded-full bg-green-100 px-2 py-0.5 text-xs whitespace-nowrap text-green-700 dark:bg-green-900 dark:text-green-300"
        >
          Your key
        </span>
        <span
          v-else
          class="rounded-full bg-blue-100 px-2 py-0.5 text-xs whitespace-nowrap text-blue-700 dark:bg-blue-900 dark:text-blue-300"
        >
          Server
        </span>
      </div>
    </CollapsibleTrigger>

    <CollapsibleContent>
      <div class="border-t px-4 pt-4 pb-4">
        <!-- Slot for feature-specific content (e.g., model hint) -->
        <slot name="before-selector" />

        <!-- Model selector -->
        <div class="flex items-end gap-3">
          <div class="flex-1">
            <label class="mb-1.5 block text-sm font-medium">Model</label>
            <div class="relative">
              <select
                :value="featureStatus.modelId"
                class="bg-background w-full appearance-none rounded-md border py-2 pr-9 pl-3"
                :disabled="isUpdating"
                @change="handleModelChange(($event.target as HTMLSelectElement).value)"
              >
                <optgroup v-for="group in groupedModels" :key="group.provider" :label="getGroupLabel(group.provider)">
                  <option
                    v-for="model in group.models"
                    :key="model.id"
                    :value="model.id"
                    :disabled="!hasUserKey(model.provider)"
                  >
                    {{ model.name }} - {{ getCostLabel(model.costTier) }}
                    {{ !hasUserKey(model.provider) ? '(No API key)' : '' }}
                  </option>
                </optgroup>
              </select>
              <ChevronDownIcon
                class="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
              />
            </div>
          </div>

          <Button v-if="featureStatus.isConfigured" variant="outline" :disabled="isResetting" @click="handleReset">
            Reset to Default
          </Button>
        </div>

        <!-- Model info -->
        <div v-if="selectedModel" class="bg-muted/50 mt-3 rounded-md p-3">
          <div class="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>{{ selectedModel.description }}</span>
            <span class="flex items-center gap-1">
              <span class="font-medium">Context:</span>
              {{ formatContextWindow(selectedModel.contextWindow) }}
            </span>
            <span class="flex items-center gap-1">
              <span class="font-medium">Capabilities:</span>
              {{ formatCapabilities(selectedModel.capabilities) }}
            </span>
            <span v-if="formattedPrice" class="flex items-center gap-1">
              <span class="font-medium">Est. cost:</span>
              {{ formattedPrice }} per 100 txns
            </span>
          </div>
        </div>

        <!-- Server-provided rate limiting warning -->
        <div
          v-if="!featureStatus.usingUserKey"
          class="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950"
        >
          <AlertTriangleIcon class="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p class="text-xs text-amber-700 dark:text-amber-300">
            Using server-provided AI with free-tier rate limiting. Feature availability depends on demand from other
            users. For reliable access, add your own API key in the API Keys tab.
          </p>
        </div>

        <!-- Slot for feature-specific content after the card (e.g., "How it works") -->
        <slot name="after-card" />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>

<script setup lang="ts">
import { getAIFeatureDisplayInfo } from '@/common/const';
import { Button } from '@/components/lib/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import { useNotificationCenter } from '@/components/notification-center';
import { useAiSettings } from '@/composable/data-queries/ai-settings';
import { type ModelGroup } from '@/composable/data-queries/use-feature-models';
import {
  AIFeatureStatus,
  AIModelCapability,
  AIModelCostTier,
  AIModelInfoWithRecommendation,
  AIModelPricing,
  AI_FEATURE,
  AI_PROVIDER,
} from '@bt/shared/types';
import { AlertTriangleIcon, ChevronDownIcon, ChevronRightIcon, FileTextIcon, TagIcon } from 'lucide-vue-next';
import { computed } from 'vue';

const props = defineProps<{
  featureStatus: AIFeatureStatus;
  groupedModels: ModelGroup[];
  availableModels: AIModelInfoWithRecommendation[];
  /** Tokens per transaction for price estimation */
  tokensPerTransaction?: { input: number; output: number };
  /** Whether the collapsible should be open by default */
  defaultOpen?: boolean;
}>();

const featureDisplayInfo = computed(() => getAIFeatureDisplayInfo({ feature: props.featureStatus.feature }));

const FEATURE_ICONS = {
  [AI_FEATURE.categorization]: TagIcon,
  [AI_FEATURE.statementParsing]: FileTextIcon,
} as const;

const featureIcon = computed(() => FEATURE_ICONS[props.featureStatus.feature]);

const PROVIDER_LABELS: Record<AI_PROVIDER, string> = {
  [AI_PROVIDER.openai]: 'OpenAI',
  [AI_PROVIDER.anthropic]: 'Anthropic',
  [AI_PROVIDER.google]: 'Google',
  [AI_PROVIDER.groq]: 'Groq',
};

const COST_LABELS: Record<AIModelCostTier, string> = {
  free: 'Free',
  low: 'Low cost',
  medium: 'Medium cost',
  high: 'High cost',
};

const { addErrorNotification, addSuccessNotification } = useNotificationCenter();
const {
  configuredProviders,
  setFeatureConfig,
  isSettingFeatureConfig: isUpdating,
  resetFeatureConfig,
  isResettingFeatureConfig: isResetting,
} = useAiSettings();

const userProviders = computed(() => new Set(configuredProviders.value.map((p) => p.provider)));
const hasUserKey = (provider: AI_PROVIDER) => userProviders.value.has(provider);

const selectedModel = computed(() => {
  return props.availableModels.find((m) => m.id === props.featureStatus.modelId);
});

const getGroupLabel = (provider: AI_PROVIDER | 'recommended') => {
  if (provider === 'recommended') {
    return '⭐ Recommended';
  }
  return PROVIDER_LABELS[provider] ?? provider;
};

const getCostLabel = (tier: AIModelCostTier) => COST_LABELS[tier] ?? tier;

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
    'text-generation': 'Text',
    'structured-output': 'Structured',
    'function-calling': 'Functions',
    vision: 'Vision',
    'fast-inference': 'Fast',
    agents: 'Agents',
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

const handleModelChange = async (modelId: string) => {
  try {
    await setFeatureConfig({ feature: props.featureStatus.feature, modelId });
    addSuccessNotification('Model updated successfully');
  } catch {
    addErrorNotification('Failed to update model');
  }
};

const handleReset = async () => {
  try {
    await resetFeatureConfig({ feature: props.featureStatus.feature });
    addSuccessNotification('Reset to default model');
  } catch {
    addErrorNotification('Failed to reset model');
  }
};
</script>
