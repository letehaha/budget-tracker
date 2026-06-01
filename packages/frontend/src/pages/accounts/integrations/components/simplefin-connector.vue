<template>
  <div class="space-y-4">
    <!-- Step 1: Enter Setup Token -->
    <template v-if="currentStep === 1">
      <div class="space-y-4">
        <div>
          <InputField
            v-model="setupToken"
            :label="t('pages.integrations.simplefin.setupTokenLabel')"
            :placeholder="t('pages.integrations.simplefin.setupTokenPlaceholder')"
            @keyup.enter="handleConnectProvider"
          />

          <Tooltip.TooltipProvider>
            <Tooltip.Tooltip>
              <Tooltip.TooltipTrigger class="mt-2 flex items-center gap-2">
                <p class="text-muted-foreground text-xs">{{ t('pages.integrations.simplefin.setupTokenHint') }}</p>
                <InfoIcon class="text-primary size-4" />
              </Tooltip.TooltipTrigger>
              <Tooltip.TooltipContent class="max-w-100 p-4">
                <span class="text-sm leading-6 opacity-90">
                  <i18n-t keypath="pages.integrations.simplefin.setupTokenInstructions" tag="span">
                    <template #link>
                      <ExternalLink href="https://beta-bridge.simplefin.org/" />
                    </template>
                  </i18n-t>
                </span>
              </Tooltip.TooltipContent>
            </Tooltip.Tooltip>
          </Tooltip.TooltipProvider>
        </div>

        <Callout v-if="connectError" variant="destructive">
          {{ connectError }}
        </Callout>

        <div class="flex justify-between gap-2">
          <UiButton variant="outline" @click="$emit('cancel')" :disabled="isLoading">
            {{ t('pages.integrations.simplefin.backButton') }}
          </UiButton>

          <DemoRestricted :message="t('demo.featureNotAvailable')">
            <UiButton
              @click="handleConnectProvider"
              :disabled="!setupToken || isLoading || isDemo"
              :loading="isLoading"
            >
              {{
                isLoading
                  ? t('pages.integrations.simplefin.connectingButton')
                  : t('pages.integrations.simplefin.connectButton')
              }}
            </UiButton>
          </DemoRestricted>
        </div>
      </div>
    </template>

    <!-- Step 2: Account Preview & Import -->
    <template v-else-if="currentStep === 2">
      <div class="space-y-4">
        <div v-if="isLoading" class="py-8 text-center">{{ t('pages.integrations.simplefin.loadingAccounts') }}</div>

        <template v-else>
          <div class="text-muted-foreground mb-2 text-sm">
            {{ t('pages.integrations.simplefin.accountsPreviewHint', { count: availableAccounts.length }) }}
          </div>

          <Callout variant="warning" class="mb-4">
            {{ t('pages.integrations.simplefin.backfillNote') }}
          </Callout>

          <AccountSelectionList v-model="selectedAccountIds" :accounts="availableAccounts" />

          <div class="flex items-center justify-between gap-2 pt-4">
            <UiButton variant="outline" @click="currentStep = 1" :disabled="isLoading">
              {{ t('pages.integrations.simplefin.backButton') }}
            </UiButton>

            <div class="flex items-center gap-2">
              <Tooltip.TooltipProvider>
                <Tooltip.Tooltip :delay-duration="0">
                  <Tooltip.TooltipTrigger as-child>
                    <UiButton variant="ghost" size="sm" :disabled="isLoading" @click="handleSkipImport">
                      {{ t('pages.integrations.simplefin.skipButton') }}
                      <InfoIcon class="text-muted-foreground ml-1 size-3.5" />
                    </UiButton>
                  </Tooltip.TooltipTrigger>
                  <Tooltip.TooltipContent class="max-w-60 p-3">
                    <p class="text-sm leading-5">
                      {{ t('pages.integrations.simplefin.skipTooltip') }}
                    </p>
                  </Tooltip.TooltipContent>
                </Tooltip.Tooltip>
              </Tooltip.TooltipProvider>

              <DemoRestricted :message="t('demo.featureNotAvailable')">
                <UiButton
                  @click="handleImportAccounts"
                  :disabled="selectedAccountIds.length === 0 || isLoading || isDemo"
                  :loading="isLoading"
                >
                  {{
                    isLoading
                      ? t('pages.integrations.simplefin.importingButton')
                      : t('pages.integrations.simplefin.importButton', { count: selectedAccountIds.length })
                  }}
                </UiButton>
              </DemoRestricted>
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
import { DemoRestricted } from '@/components/demo';
import ExternalLink from '@/components/external-link.vue';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import * as Tooltip from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useSyncStatus } from '@/composable/use-sync-status';
import { useAccountsStore, useOnboardingStore, useUserStore } from '@/stores';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { InfoIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import AccountSelectionList from './account-selection-list.vue';

const { t } = useI18n();

const emit = defineEmits<{
  connected: [];
  cancel: [];
}>();

const { addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const syncStatus = useSyncStatus();
const { isDemo } = storeToRefs(useUserStore());

const currentStep = ref(1);
const isLoading = ref(false);

// Step 1 data
const setupToken = ref('');
const connectionId = ref<string | null>(null);
// Inline connect error: kept in the form (not a toast) so it survives long
// enough to read. Cleared as soon as the user edits the token to try again.
const connectError = ref<string | null>(null);
watch(setupToken, () => {
  connectError.value = null;
});

// Step 2 data
const availableAccounts = ref<AvailableAccount[]>([]);
const selectedAccountIds = ref<string[]>([]);

const handleConnectProvider = async () => {
  if (!setupToken.value || isLoading.value || isDemo.value) return;

  try {
    isLoading.value = true;
    connectError.value = null;

    const response = await connectProvider(BANK_PROVIDER_TYPE.SIMPLEFIN, { setupToken: setupToken.value });

    connectionId.value = response.connectionId;

    const accounts = await getAvailableAccounts(response.connectionId);
    availableAccounts.value = accounts;

    currentStep.value = 2;
  } catch (error) {
    connectError.value = getErrorMessage(error) || t('pages.integrations.simplefin.errors.connectFailed');
  } finally {
    isLoading.value = false;
  }
};

const handleSkipImport = () => {
  emit('connected');
};

const handleImportAccounts = () => {
  if (!connectionId.value || selectedAccountIds.value.length === 0 || isDemo.value) {
    return;
  }

  const id = connectionId.value;
  const accountIds = selectedAccountIds.value;

  // Kick off create + initial sync on the server, but don't block the dialog on
  // the (potentially long) backfill — the header spinner shows progress while
  // the accounts sync in the background.
  const importPromise = syncSelectedAccounts(id, accountIds);

  // Watch the sync in the header (open SSE + load status) without re-triggering.
  void syncStatus.watchSync();

  // Refresh accounts + onboarding once the request resolves; surface failures
  // via a toast (the dialog is already closed).
  importPromise
    .then(async () => {
      await accountsStore.refetchAccounts();
      useOnboardingStore().completeTask('connect-bank');
    })
    .catch((error) => {
      addErrorNotification(getErrorMessage(error) || t('pages.integrations.simplefin.errors.importFailed'));
    });

  emit('connected');
};

const getErrorMessage = (error: unknown): string | undefined => {
  const apiMessage = (error as { data?: { message?: string } })?.data?.message;
  if (apiMessage) return apiMessage;
  if (error instanceof Error && error.message) return error.message;
  return undefined;
};
</script>
