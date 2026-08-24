<template>
  <div class="flex max-w-4xl flex-col gap-6">
    <Card>
      <CardHeader class="border-b">
        <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.general.title') }}</h2>
        <p class="text-sm opacity-80">{{ $t('settings.general.description') }}</p>
      </CardHeader>

      <CardContent class="mt-6 flex flex-col gap-6">
        <div class="flex items-center justify-between gap-4">
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ $t('settings.general.creditLimit.label') }}
            </div>
            <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
              {{ $t('settings.general.creditLimit.description') }}
            </p>
          </div>
          <Switch
            :model-value="includeCreditLimitInStats"
            :disabled="isUpdating"
            @update:model-value="handleCreditLimitToggle"
          />
        </div>

        <Separator />

        <div class="flex items-center justify-between gap-4">
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ $t('settings.general.manualTransferMatching.label') }}
            </div>
            <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
              {{ $t('settings.general.manualTransferMatching.description') }}
            </p>
          </div>
          <Switch
            :model-value="matchTransfersWithManualAccounts"
            :disabled="isUpdating"
            @update:model-value="handleManualTransferMatchingToggle"
          />
        </div>

        <Separator />

        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="min-w-48 flex-1">
            <div class="text-sm font-medium">
              {{ $t('settings.general.savingsCategories.label') }}
            </div>
            <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
              {{ $t('settings.general.savingsCategories.description') }}
            </p>
          </div>
          <!-- The field's own root is w-full, so the width lives on a wrapper instead of its class. -->
          <div class="w-64 shrink-0">
            <CategoryMultiSelectField
              :model-value="savingsCategoryIds"
              :disabled="isUpdating"
              @update:model-value="handleSavingsCategoriesChange"
            />
          </div>
        </div>

        <Separator />

        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="min-w-48 flex-1">
            <div class="text-sm font-medium">
              {{ $t('settings.general.accountDropdowns.defaultAccount.label') }}
            </div>
            <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
              {{ $t('settings.general.accountDropdowns.defaultAccount.description') }}
            </p>
          </div>
          <AccountSelectField
            class="w-64 shrink-0"
            :model-value="defaultAccount"
            :accounts="activeSourceAccounts"
            :placeholder="$t('settings.general.accountDropdowns.defaultAccount.placeholder')"
            :disabled="isDropdownPrefsUpdating"
            clearable
            @update:model-value="handleDefaultAccountChange"
          />
        </div>

        <Separator />

        <div class="flex items-center justify-between gap-4">
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ $t('settings.general.accountDropdowns.showArchived.label') }}
            </div>
            <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
              {{ $t('settings.general.accountDropdowns.showArchived.description') }}
            </p>
          </div>
          <Switch
            :model-value="showArchivedInDropdowns"
            :disabled="isDropdownPrefsUpdating"
            @update:model-value="handleShowArchivedToggle"
          />
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import AccountSelectField from '@/components/fields/account-select-field.vue';
import CategoryMultiSelectField from '@/components/fields/category-multi-select-field.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Separator } from '@/components/lib/ui/separator';
import { Switch } from '@/components/lib/ui/switch';
import { useNotificationCenter } from '@/components/notification-center';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { filterDropdownAccounts, useAccountDropdownPrefs } from '@/composable/use-account-dropdown-prefs';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { useQueryClient } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { data: userSettings, mutateAsync, isUpdating } = useUserSettings();
const { accountsRecord, txTargetableSourceAccountsActiveFirst } = storeToRefs(useAccountsStore());
const {
  defaultAccountId,
  showArchivedInDropdowns,
  setDefaultAccountId,
  setShowArchivedInDropdowns,
  isUpdating: isDropdownPrefsUpdating,
} = useAccountDropdownPrefs();

const includeCreditLimitInStats = computed(() => userSettings.value?.includeCreditLimitInStats ?? false);
const matchTransfersWithManualAccounts = computed(() => userSettings.value?.matchTransfersWithManualAccounts ?? false);
const savingsCategoryIds = computed(() => userSettings.value?.savingsCategoryIds ?? []);

const defaultAccount = computed<AccountModel | null>(() =>
  defaultAccountId.value ? (accountsRecord.value[defaultAccountId.value] ?? null) : null,
);
const activeSourceAccounts = computed(() =>
  filterDropdownAccounts({ accounts: txTargetableSourceAccountsActiveFirst.value, showArchived: false }),
);

const handleCreditLimitToggle = async (value: boolean) => {
  try {
    await mutateAsync({
      ...userSettings.value,
      includeCreditLimitInStats: value,
    });

    addSuccessNotification(t('settings.general.creditLimit.successNotification'));

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrend] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrendPrev] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTotalBalance] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalancePreviousBalance] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsBalanceHistoryTrend] }),
    ]);
  } catch {
    addErrorNotification(t('settings.general.creditLimit.errorNotification'));
  }
};

const handleManualTransferMatchingToggle = async (value: boolean) => {
  try {
    await mutateAsync({
      ...userSettings.value,
      matchTransfersWithManualAccounts: value,
    });

    addSuccessNotification(t('settings.general.manualTransferMatching.successNotification'));
  } catch {
    addErrorNotification(t('settings.general.manualTransferMatching.errorNotification'));
  }
};

const handleSavingsCategoriesChange = async (value: string[]) => {
  try {
    await mutateAsync({
      ...userSettings.value,
      savingsCategoryIds: value,
    });

    addSuccessNotification(t('settings.general.savingsCategories.successNotification'));

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsCashFlow] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetCashFlow] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetCashFlowPrev] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetCashFlowTrend] }),
    ]);
  } catch {
    addErrorNotification(t('settings.general.savingsCategories.errorNotification'));
  }
};

const applyDropdownPref = async ({ update }: { update: () => Promise<unknown> }) => {
  try {
    await update();
    addSuccessNotification(t('settings.general.accountDropdowns.successNotification'));
  } catch {
    addErrorNotification(t('settings.general.accountDropdowns.errorNotification'));
  }
};

const handleDefaultAccountChange = (account: AccountModel | null) =>
  applyDropdownPref({ update: () => setDefaultAccountId({ id: account?.id ?? null }) });

const handleShowArchivedToggle = (value: boolean) =>
  applyDropdownPref({ update: () => setShowArchivedInDropdowns({ value }) });
</script>
