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
            class="h-auto w-full justify-start"
            @click="handleSelectProvider(provider.type)"
          >
            <div class="flex items-center gap-6">
              <img
                class="size-10"
                :src="
                  currentTheme === Themes.dark
                    ? providerMetainfo[provider.type].icon.dark
                    : providerMetainfo[provider.type].icon.light
                "
              />

              <div class="flex flex-col text-left">
                <p class="mb-1 text-lg">
                  {{ provider.name }}
                </p>
                <p class="text-sm opacity-70">
                  {{ providerMetainfo[provider.type].description }}
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
import { Themes, currentTheme } from '@/common/utils';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/lib/ui/dialog';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { computed, ref, watch } from 'vue';

import EnableBankingConnector from './EnableBankingConnector.vue';
import MonobankConnector from './MonobankConnector.vue';

interface Props {
  open: boolean;
  providers: BankProvider[];
}

const providerMetainfo = {
  [BANK_PROVIDER_TYPE.ENABLE_BANKING]: {
    icon: {
      dark: 'https://cdn.brandfetch.io/idJpLeYSIH/w/994/h/1041/theme/light/logo.png?c=1bxid64Mup7aczewSAYMX&t=1762089232186',
      light:
        'https://cdn.brandfetch.io/idJpLeYSIH/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1762089232284',
    },
    description: 'Access 6000+ European banks via PSD2 open banking',
  },
  [BANK_PROVIDER_TYPE.MONOBANK]: {
    icon: {
      dark: 'https://cdn.brandfetch.io/id-CBRc8NA/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1674203441813',
      light:
        'https://cdn.brandfetch.io/id-CBRc8NA/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1674203441813',
    },
    description: 'Ukrainian digital bank',
  },
};

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

console.log('providers', props.providers);

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
