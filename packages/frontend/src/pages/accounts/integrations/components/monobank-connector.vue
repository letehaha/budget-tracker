<template>
  <div class="space-y-4">
    <!-- Step 1: Enter API Token -->
    <template v-if="currentStep === 1">
      <div class="space-y-4">
        <div>
          <InputField
            v-model="apiToken"
            type="password"
            :label="t('pages.integrations.monobank.apiTokenLabel')"
            :placeholder="$t('pages.integrations.monobank.tokenPlaceholder')"
            @keyup.enter="handleConnectProvider"
          />

          <CredentialsHelpTrigger :label="t('pages.integrations.monobank.help.trigger')" @click="showHelp = true" />
        </div>
        <div>
          <InputField
            v-model="connectionName"
            type="text"
            :label="t('pages.integrations.monobank.connectionNameLabel')"
            :placeholder="$t('pages.integrations.monobank.accountNamePlaceholder')"
          />
        </div>
        <div class="flex justify-between gap-2">
          <UiButton variant="outline" @click="$emit('cancel')" :disabled="isLoading">
            {{ t('pages.integrations.monobank.backButton') }}
          </UiButton>

          <DemoRestricted :message="t('demo.featureNotAvailable')" feature="bank_connect_monobank">
            <UiButton @click="handleConnectProvider" :disabled="!apiToken || isLoading || isDemo">
              {{
                isLoading
                  ? t('pages.integrations.monobank.connectingButton')
                  : t('pages.integrations.monobank.connectButton')
              }}
            </UiButton>
          </DemoRestricted>
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

          <AccountSelectionList
            v-model="selectedAccountIds"
            :accounts="availableAccounts"
            :provider-type="BANK_PROVIDER_TYPE.MONOBANK"
          />

          <div class="flex justify-between gap-2 pt-4">
            <UiButton variant="outline" @click="currentStep = 1" :disabled="isLoading">
              {{ t('pages.integrations.monobank.backButton') }}
            </UiButton>

            <DemoRestricted :message="t('demo.featureNotAvailable')" feature="bank_connect_monobank_import_accounts">
              <UiButton @click="handleSyncAccounts" :disabled="selectedAccountIds.length === 0 || isLoading || isDemo">
                {{
                  isLoading
                    ? t('pages.integrations.monobank.syncingButton')
                    : t('pages.integrations.monobank.syncButton', { count: selectedAccountIds.length })
                }}
              </UiButton>
            </DemoRestricted>
          </div>
        </template>
      </div>
    </template>

    <InstructionsDialog v-model:open="showHelp" :title="t('pages.integrations.monobank.help.title')">
      <div class="space-y-2">
        <InstructionStep :step="1">
          <template #title>
            <i18n-t keypath="pages.integrations.monobank.help.step1" tag="span">
              <template #link>
                <ExternalLink :href="MONOBANK_API_URL" />
              </template>
            </i18n-t>
          </template>
        </InstructionStep>
        <InstructionStep :step="2" :title="t('pages.integrations.monobank.help.step2')" />
      </div>

      <p class="text-muted-foreground mt-3 text-xs">{{ t('pages.integrations.monobank.help.note') }}</p>

      <template #footer>
        <UiButton as="a" :href="MONOBANK_API_URL" target="_blank" rel="noopener">
          <ExternalLinkIcon class="size-4" />
          {{ t('pages.integrations.help.openSite', { site: 'api.monobank.ua' }) }}
        </UiButton>
      </template>
    </InstructionsDialog>
  </div>
</template>

<script lang="ts" setup>
import {
  type AvailableAccount,
  connectProvider,
  getAvailableAccounts,
  syncSelectedAccounts,
} from '@/api/bank-data-providers';
import { DemoRestricted } from '@/components/demo';
import ExternalLink from '@/components/external-link.vue';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore, useOnboardingStore, useUserStore } from '@/stores';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { ExternalLinkIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

import AccountSelectionList from './account-selection-list.vue';
import CredentialsHelpTrigger from './shared/credentials-help-trigger.vue';
import InstructionStep from './shared/instruction-step.vue';
import InstructionsDialog from './shared/instructions-dialog.vue';

const MONOBANK_API_URL = 'https://api.monobank.ua';

const { t } = useI18n();

const emit = defineEmits<{
  connected: [];
  cancel: [];
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const { isDemo } = storeToRefs(useUserStore());

const currentStep = ref(1);
const isLoading = ref(false);
const showHelp = ref(false);

// Step 1 data
const apiToken = ref('');
const connectionName = ref('');
const connectionId = ref<string | null>(null);

// Step 2 data
const availableAccounts = ref<AvailableAccount[]>([]);
const selectedAccountIds = ref<string[]>([]);

const handleConnectProvider = async () => {
  if (!apiToken.value || isLoading.value || isDemo.value) return;

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
  if (!connectionId.value || selectedAccountIds.value.length === 0 || isLoading.value || isDemo.value) {
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
</script>
