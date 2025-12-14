<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-w-2xl">
      <DialogHeader class="mb-4">
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
      </DialogHeader>

      <!-- Step 1: Select Provider -->
      <template v-if="currentStep === 'select-provider'">
        <div class="space-y-2">
          <p class="text-muted-foreground mt-4 mb-8 text-sm">Choose a bank data provider to connect</p>

          <UiButton
            v-for="provider in providers"
            :key="provider.type"
            variant="outline"
            class="h-max w-full justify-start whitespace-normal"
            @click="handleSelectProvider(provider.type)"
          >
            <div class="flex items-center gap-3 sm:gap-6">
              <BankProviderLogo class="size-12" :provider="provider.type" />

              <div class="flex flex-col text-left">
                <p class="mb-1 text-lg">
                  {{ provider.name }}
                </p>
                <p class="text-sm opacity-70">
                  {{ METAINFO_FROM_TYPE[provider.type].description }}
                </p>
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
        <!-- Add other provider components here -->
        <!-- <OtherProviderConnector
          v-else-if="selectedProviderType === 'other-provider'"
          @connected="handleProviderConnected"
          @cancel="handleCancel"
        /> -->
      </template>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import type { BankProvider } from '@/api/bank-data-providers';
import { METAINFO_FROM_TYPE } from '@/common/const/bank-providers';
import BankProviderLogo from '@/components/common/bank-providers/bank-provider-logo.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/lib/ui/dialog';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { computed, ref, watch } from 'vue';

import EnableBankingConnector from './enable-banking-connector.vue';
import MonobankConnector from './monobank-connector.vue';

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
    return 'Add Integration';
  }
  const provider = props.providers.find((p) => p.type === selectedProviderType.value);
  return `Connect ${provider?.name || 'Provider'}`;
});

const handleSelectProvider = (providerType: string) => {
  selectedProviderType.value = providerType;
  currentStep.value = 'connect-provider';
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
