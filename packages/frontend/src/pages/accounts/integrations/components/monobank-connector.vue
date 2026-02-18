<template>
  <div class="space-y-4">
    <!-- Step 1: Enter API Token -->
    <template v-if="currentStep === 1">
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium">{{ t('pages.integrations.monobank.apiTokenLabel') }}</label>
          <input
            v-model="apiToken"
            type="password"
            class="w-full rounded-md border px-3 py-2"
            :placeholder="$t('pages.integrations.monobank.tokenPlaceholder')"
            @keyup.enter="handleConnectProvider"
          />

          <ResponsiveTooltip content-class-name="max-w-100 p-4">
            <span class="mt-2 flex items-center gap-2">
              <InfoIcon class="text-primary size-4" />
              <p class="text-muted-foreground text-xs">{{ t('pages.integrations.monobank.tokenHint') }}</p>
            </span>
            <template #content>
              <span class="text-sm leading-6 opacity-90">
                <i18n-t keypath="pages.integrations.monobank.tokenInstructions" tag="span">
                  <template #link>
                    <ExternalLink href="https://api.monobank.ua" />
                  </template>
                </i18n-t>
                <br />
                <b>{{ t('pages.integrations.monobank.tokenReadOnlyNote') }}</b>
                {{ t('pages.integrations.monobank.tokenReadOnlyText') }}
              </span>
            </template>
          </ResponsiveTooltip>
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium">{{
            t('pages.integrations.monobank.connectionNameLabel')
          }}</label>
          <input
            v-model="connectionName"
            type="text"
            class="w-full rounded-md border px-3 py-2"
            :placeholder="$t('pages.integrations.monobank.accountNamePlaceholder')"
          />
        </div>
        <div class="flex justify-between gap-2">
          <UiButton variant="outline" @click="$emit('cancel')" :disabled="isLoading">
            {{ t('pages.integrations.monobank.backButton') }}
          </UiButton>

          <UiButton @click="handleConnectProvider" :disabled="!apiToken || isLoading">
            {{
              isLoading
                ? t('pages.integrations.monobank.connectingButton')
                : t('pages.integrations.monobank.connectButton')
            }}
          </UiButton>
        </div>
      </div>
    </template>

    <!-- Step 2: Select Accounts -->
    <template v-else-if="currentStep === 2">
      <div class="space-y-4">
        <div v-if="isLoading" class="py-8 text-center">{{ t('pages.integrations.monobank.loadingAccounts') }}</div>

        <template v-else>
          <div class="text-muted-foreground mb-4 text-sm">
            {{ t('pages.integrations.monobank.selectAccountsHint') }}
          </div>

          <div class="space-y-2">
            <label
              v-for="account in availableAccounts"
              :key="account.externalId"
              class="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border p-3"
            >
              <input type="checkbox" :value="account.externalId" v-model="selectedAccountIds" class="size-4" />
              <div class="flex-1">
                <div class="font-medium">{{ account.name }}</div>
                <div class="text-muted-foreground text-sm">
                  {{ formatBalance(account.balance, account.currency) }}
                </div>
              </div>
            </label>
          </div>

          <div class="flex justify-between gap-2 pt-4">
            <UiButton variant="outline" @click="currentStep = 1" :disabled="isLoading">
              {{ t('pages.integrations.monobank.backButton') }}
            </UiButton>

            <UiButton @click="handleSyncAccounts" :disabled="selectedAccountIds.length === 0 || isLoading">
              {{
                isLoading
                  ? t('pages.integrations.monobank.syncingButton')
                  : t('pages.integrations.monobank.syncButton', { count: selectedAccountIds.length })
              }}
            </UiButton>
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
import ResponsiveTooltip from '@/components/common/responsive-tooltip.vue';
import ExternalLink from '@/components/external-link.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore, useOnboardingStore } from '@/stores';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { InfoIcon } from 'lucide-vue-next';
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
const apiToken = ref('');
const connectionName = ref('');
const connectionId = ref<number | null>(null);

// Step 2 data
const availableAccounts = ref<AvailableAccount[]>([]);
const selectedAccountIds = ref<string[]>([]);

const handleConnectProvider = async () => {
  if (!apiToken.value || isLoading.value) return;

  try {
    isLoading.value = true;

    // Step 1: Connect provider
    const response = await connectProvider(
      BANK_PROVIDER_TYPE.MONOBANK,
      { apiToken: apiToken.value },
      connectionName.value || undefined,
    );

    connectionId.value = response.connectionId;

    // Step 2: Fetch available accounts
    const accounts = await getAvailableAccounts(response.connectionId);
    availableAccounts.value = accounts;

    // Move to step 2
    currentStep.value = 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : t('pages.integrations.monobank.errors.connectFailed');
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const handleSyncAccounts = async () => {
  if (!connectionId.value || selectedAccountIds.value.length === 0 || isLoading.value) {
    return;
  }

  try {
    isLoading.value = true;

    await syncSelectedAccounts(connectionId.value, selectedAccountIds.value);

    // Refresh accounts store
    await accountsStore.refetchAccounts();

    // Mark onboarding task as complete
    const onboardingStore = useOnboardingStore();
    onboardingStore.completeTask('connect-bank');

    addSuccessNotification(t('pages.integrations.monobank.syncSuccess', { count: selectedAccountIds.value.length }));

    // Emit connected event to close dialog
    emit('connected');
  } catch (error) {
    const message = error instanceof Error ? error.message : t('pages.integrations.monobank.errors.syncFailed');
    addErrorNotification(message);
  } finally {
    isLoading.value = false;
  }
};

const formatBalance = (balance: number, currency: string) => {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency,
  }).format(balance);
};
</script>
