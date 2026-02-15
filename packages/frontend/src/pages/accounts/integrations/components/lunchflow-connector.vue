<template>
  <div class="space-y-4">
    <!-- Step 1: Enter API Key -->
    <template v-if="currentStep === 1">
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium">{{ t('pages.integrations.lunchflow.apiKeyLabel') }}</label>
          <input
            v-model="apiKey"
            type="password"
            class="w-full rounded-md border px-3 py-2"
            :placeholder="t('pages.integrations.lunchflow.apiKeyPlaceholder')"
            @keyup.enter="handleConnectProvider"
          />

          <Tooltip.TooltipProvider>
            <Tooltip.Tooltip>
              <Tooltip.TooltipTrigger class="mt-2 flex items-center gap-2">
                <p class="text-muted-foreground text-xs">{{ t('pages.integrations.lunchflow.apiKeyHint') }}</p>
                <InfoIcon class="text-primary size-4" />
              </Tooltip.TooltipTrigger>
              <Tooltip.TooltipContent class="max-w-100 p-4">
                <span class="text-sm leading-6 opacity-90">
                  <i18n-t keypath="pages.integrations.lunchflow.apiKeyInstructions" tag="span">
                    <template #link>
                      <ExternalLink href="https://lunchflow.app/dashboard" />
                    </template>
                  </i18n-t>
                </span>
              </Tooltip.TooltipContent>
            </Tooltip.Tooltip>
          </Tooltip.TooltipProvider>
        </div>
        <div class="flex justify-between gap-2">
          <UiButton variant="outline" @click="$emit('cancel')" :disabled="isLoading">
            {{ t('pages.integrations.lunchflow.backButton') }}
          </UiButton>

          <UiButton @click="handleConnectProvider" :disabled="!apiKey || isLoading">
            {{
              isLoading
                ? t('pages.integrations.lunchflow.connectingButton')
                : t('pages.integrations.lunchflow.connectButton')
            }}
          </UiButton>
        </div>
      </div>
    </template>

    <!-- Step 2: Account Preview & Import -->
    <template v-else-if="currentStep === 2">
      <div class="space-y-4">
        <div v-if="isLoading" class="py-8 text-center">{{ t('pages.integrations.lunchflow.loadingAccounts') }}</div>

        <template v-else>
          <div class="text-muted-foreground mb-4 text-sm">
            {{ t('pages.integrations.lunchflow.accountsPreviewHint', { count: availableAccounts.length }) }}
          </div>

          <div class="space-y-2">
            <div
              v-for="account in availableAccounts"
              :key="account.externalId"
              class="flex items-center gap-3 rounded-md border p-3"
            >
              <img
                v-if="account.metadata?.institutionLogo"
                :src="account.metadata.institutionLogo as string"
                :alt="account.metadata?.institutionName as string"
                class="size-8 rounded-full object-contain"
              />
              <div v-else class="bg-muted flex size-8 items-center justify-center rounded-full">
                <BuildingIcon class="text-muted-foreground size-4" />
              </div>
              <div class="flex-1">
                <div class="font-medium">{{ account.name }}</div>
                <div class="text-muted-foreground text-xs">
                  {{ account.metadata?.institutionName || '' }}
                </div>
              </div>
              <div class="text-right">
                <div class="text-sm font-medium">
                  {{ formatBalance(account.balance, account.currency) }}
                </div>
                <div class="text-muted-foreground text-xs">{{ account.currency }}</div>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between gap-2 pt-4">
            <UiButton variant="outline" @click="currentStep = 1" :disabled="isLoading">
              {{ t('pages.integrations.lunchflow.backButton') }}
            </UiButton>

            <div class="flex items-center gap-2">
              <Tooltip.TooltipProvider>
                <Tooltip.Tooltip :delay-duration="0">
                  <Tooltip.TooltipTrigger as-child>
                    <UiButton variant="ghost" size="sm" :disabled="isLoading" @click="handleSkipImport">
                      {{ t('pages.integrations.lunchflow.skipButton') }}
                      <InfoIcon class="text-muted-foreground ml-1 size-3.5" />
                    </UiButton>
                  </Tooltip.TooltipTrigger>
                  <Tooltip.TooltipContent class="max-w-60 p-3">
                    <p class="text-sm leading-5">
                      {{ t('pages.integrations.lunchflow.skipTooltip') }}
                    </p>
                  </Tooltip.TooltipContent>
                </Tooltip.Tooltip>
              </Tooltip.TooltipProvider>

              <UiButton @click="handleImportAccounts" :disabled="availableAccounts.length === 0 || isLoading">
                {{
                  isLoading
                    ? t('pages.integrations.lunchflow.importingButton')
                    : t('pages.integrations.lunchflow.importButton', { count: availableAccounts.length })
                }}
              </UiButton>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import {
  type AvailableAccount,
  connectProvider,
  getAvailableAccounts,
  syncSelectedAccounts,
} from '@/api/bank-data-providers';
import ExternalLink from '@/components/external-link.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Tooltip from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore, useOnboardingStore } from '@/stores';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { BuildingIcon, InfoIcon } from 'lucide-vue-next';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const emit = defineEmits<{
  connected: [];
  cancel: [];
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();

const currentStep = ref(1);
const isLoading = ref(false);

// Step 1 data
const apiKey = ref('');
const connectionId = ref<number | null>(null);

// Step 2 data
const availableAccounts = ref<AvailableAccount[]>([]);

const handleConnectProvider = async () => {
  if (!apiKey.value || isLoading.value) return;

  try {
    isLoading.value = true;

    const response = await connectProvider(BANK_PROVIDER_TYPE.LUNCHFLOW, { apiKey: apiKey.value });

    connectionId.value = response.connectionId;

    const accounts = await getAvailableAccounts(response.connectionId);
    availableAccounts.value = accounts;

    currentStep.value = 2;
  } catch (error) {
    const message = getErrorMessage(error) || t('pages.integrations.lunchflow.errors.connectFailed');
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const handleSkipImport = () => {
  emit('connected');
};

const handleImportAccounts = async () => {
  if (!connectionId.value || availableAccounts.value.length === 0 || isLoading.value) {
    return;
  }

  try {
    isLoading.value = true;

    const allAccountIds = availableAccounts.value.map((a) => a.externalId);
    await syncSelectedAccounts(connectionId.value, allAccountIds);

    await accountsStore.refetchAccounts();

    const onboardingStore = useOnboardingStore();
    onboardingStore.completeTask('connect-bank');

    addSuccessNotification(t('pages.integrations.lunchflow.importSuccess', { count: allAccountIds.length }));

    emit('connected');
  } catch (error) {
    const message = getErrorMessage(error) || t('pages.integrations.lunchflow.errors.importFailed');
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const getErrorMessage = (error: unknown): string | undefined => {
  const apiMessage = (error as { data?: { message?: string } })?.data?.message;
  if (apiMessage) return apiMessage;
  if (error instanceof Error && error.message) return error.message;
  return undefined;
};

const formatBalance = (balance: number, currency: string) => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(balance);
};
</script>
