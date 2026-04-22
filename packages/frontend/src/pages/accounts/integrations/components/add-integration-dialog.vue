<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-2xl">
      <DialogHeader class="mb-4">
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>

      <div class="-mx-6 min-h-0 flex-1 overflow-y-auto px-6">
        <!-- Step 1: Select Provider -->
        <template v-if="currentStep === 'select-provider'">
          <div class="space-y-2">
            <p class="text-muted-foreground mt-4 mb-8 text-sm">
              {{ t('pages.integrations.addDialog.selectProviderHint') }}
            </p>

            <UiButton
              v-for="provider in sortedProviders"
              :key="provider.type"
              variant="outline"
              class="h-max w-full justify-start whitespace-normal"
              @click="handleSelectProvider(provider.type)"
            >
              <div class="flex items-center gap-3 sm:gap-6">
                <BankProviderLogo class="size-12" :provider="provider.type" />

                <div class="flex flex-col text-left">
                  <p class="mb-1 flex items-center gap-2 text-lg">
                    {{ provider.name }}
                    <span
                      v-if="provider.type === BANK_PROVIDER_TYPE.ENABLE_BANKING"
                      class="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                    >
                      {{ t('pages.integrations.addDialog.betaBadge') }}
                    </span>
                  </p>
                  <p class="text-sm opacity-70">
                    {{ t(METAINFO_FROM_TYPE[provider.type as keyof typeof METAINFO_FROM_TYPE]!.descriptionKey) }}
                  </p>
                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      :class="
                        pricingBadgeClass(METAINFO_FROM_TYPE[provider.type as keyof typeof METAINFO_FROM_TYPE]!.pricing)
                      "
                    >
                      {{ t(METAINFO_FROM_TYPE[provider.type as keyof typeof METAINFO_FROM_TYPE]!.pricingLabelKey) }}
                    </span>
                    <ResponsiveTooltip
                      :content="
                        t(METAINFO_FROM_TYPE[provider.type as keyof typeof METAINFO_FROM_TYPE]!.difficultyTooltipKey)
                      "
                      content-class-name="max-w-xs text-wrap"
                    >
                      <span
                        :class="
                          difficultyBadgeClass(
                            METAINFO_FROM_TYPE[provider.type as keyof typeof METAINFO_FROM_TYPE]!.difficulty,
                          )
                        "
                        class="inline-flex items-center gap-1"
                      >
                        {{
                          t(METAINFO_FROM_TYPE[provider.type as keyof typeof METAINFO_FROM_TYPE]!.difficultyLabelKey)
                        }}
                        <InfoIcon class="size-3" />
                      </span>
                    </ResponsiveTooltip>
                  </div>
                  <div class="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      v-for="region in METAINFO_FROM_TYPE[provider.type as keyof typeof METAINFO_FROM_TYPE]!.regions"
                      :key="region.code"
                      class="bg-muted text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
                    >
                      <img
                        :src="`/img/flags/${region.code}.svg`"
                        :alt="t(region.labelKey)"
                        class="h-3 w-4 rounded-xs object-cover"
                      />
                      {{ t(region.labelKey) }}
                    </span>
                  </div>
                </div>
              </div>
            </UiButton>
          </div>
        </template>

        <!-- Step 2: Provider-specific connection flow -->
        <template v-else-if="currentStep === 'connect-provider' && selectedProviderType">
          <MonobankConnector
            v-if="selectedProviderType === BANK_PROVIDER_TYPE.MONOBANK"
            @connected="handleProviderConnected"
            @cancel="handleCancel"
          />
          <EnableBankingConnector
            v-else-if="selectedProviderType === BANK_PROVIDER_TYPE.ENABLE_BANKING"
            @connected="handleProviderConnected"
            @cancel="handleCancel"
          />
          <LunchFlowConnector
            v-else-if="selectedProviderType === BANK_PROVIDER_TYPE.LUNCHFLOW"
            @connected="handleProviderConnected"
            @cancel="handleCancel"
          />
          <WalutomatConnector
            v-else-if="selectedProviderType === BANK_PROVIDER_TYPE.WALUTOMAT"
            @connected="handleProviderConnected"
            @cancel="handleCancel"
          />
        </template>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import type { BankProvider } from '@/api/bank-data-providers';
import {
  type DifficultyType,
  METAINFO_FROM_TYPE,
  type PricingType,
  PROVIDER_DISPLAY_ORDER,
} from '@/common/const/bank-providers';
import BankProviderLogo from '@/components/common/bank-providers/bank-provider-logo.vue';
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/lib/ui/dialog';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { InfoIcon } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import EnableBankingConnector from './enable-banking-connector.vue';
import LunchFlowConnector from './lunchflow-connector.vue';
import MonobankConnector from './monobank-connector.vue';
import WalutomatConnector from './walutomat-connector.vue';

const { t } = useI18n();

interface Props {
  open: boolean;
  providers: BankProvider[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  'integration-added': [];
}>();

type Step = 'select-provider' | 'connect-provider';

const currentStep = ref<Step>('select-provider');
const selectedProviderType = ref<string | null>(null);

const dialogTitle = computed(() => {
  if (currentStep.value === 'select-provider') {
    return t('pages.integrations.addDialog.titleSelect');
  }
  const provider = props.providers.find((p) => p.type === selectedProviderType.value);
  return t('pages.integrations.addDialog.titleConnect', { provider: provider?.name || 'Provider' });
});

const sortedProviders = computed(() => {
  const orderIndex = (type: string) => {
    const index = PROVIDER_DISPLAY_ORDER.indexOf(type);
    return index === -1 ? PROVIDER_DISPLAY_ORDER.length : index;
  };
  return [...props.providers].sort((a, b) => orderIndex(a.type) - orderIndex(b.type));
});

const BADGE_BASE = 'rounded px-1.5 py-0.5 text-xs font-medium';

const pricingBadgeClass = (pricing: PricingType) => {
  if (pricing === 'free') {
    return `${BADGE_BASE} bg-success/20 text-success-text`;
  }
  return `${BADGE_BASE} bg-warning/20 text-warning-text`;
};

const difficultyBadgeClass = (difficulty: DifficultyType) => {
  if (difficulty === 'easy') {
    return `${BADGE_BASE} bg-success/20 text-success-text`;
  }
  if (difficulty === 'medium') {
    return `${BADGE_BASE} bg-warning/20 text-warning-text`;
  }
  return `${BADGE_BASE} bg-destructive/20 text-destructive-text`;
};

const handleSelectProvider = (providerType: string) => {
  selectedProviderType.value = providerType;
  currentStep.value = 'connect-provider';
  trackAnalyticsEvent({
    event: 'bank_connection_opened',
    properties: { provider: providerType },
  });
};

const handleProviderConnected = () => {
  emit('integration-added');
  resetDialog();
};

const handleCancel = () => {
  currentStep.value = 'select-provider';
  selectedProviderType.value = null;
};

const resetDialog = () => {
  currentStep.value = 'select-provider';
  selectedProviderType.value = null;
};

// Reset dialog state when it closes
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      setTimeout(resetDialog, 200); // Small delay to avoid visual glitches
    }
  },
);
</script>
