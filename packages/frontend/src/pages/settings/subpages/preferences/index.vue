<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.preferences.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.preferences.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6 flex flex-col gap-6">
      <!-- Balance & Statistics Section -->
      <div>
        <h3 class="mb-2 text-lg font-medium">
          {{ $t('settings.preferences.balanceStats.title') }}
        </h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.preferences.balanceStats.description') }}
        </p>

        <div class="flex items-center justify-between gap-4">
          <div class="flex-1">
            <div class="text-sm font-medium">
              {{ $t('settings.preferences.balanceStats.creditLimit.label') }}
            </div>
            <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
              {{ $t('settings.preferences.balanceStats.creditLimit.description') }}
            </p>
          </div>
          <Switch
            :model-value="includeCreditLimitInStats"
            :disabled="isUpdatingCreditLimitSetting"
            @update:model-value="handleCreditLimitToggle"
          />
        </div>
      </div>

      <Separator />

      <!-- Quick Start Section -->
      <div>
        <h3 class="mb-2 text-lg font-medium">{{ $t('settings.preferences.quickStart.title') }}</h3>
        <p class="mb-4 text-sm leading-relaxed">
          {{ $t('settings.preferences.quickStart.description') }}
        </p>

        <div class="flex items-center gap-3">
          <Button variant="outline" :disabled="isReopening || !isDismissed" @click="handleReopenQuickStart">
            <RocketIcon class="mr-2 size-4" />
            {{ $t('settings.preferences.quickStart.button') }}
          </Button>

          <span v-if="!isDismissed" class="text-success-text text-sm">
            {{ $t('settings.preferences.quickStart.activeLabel') }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import Button from '@/components/lib/ui/button/Button.vue';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Separator } from '@/components/lib/ui/separator';
import { Switch } from '@/components/lib/ui/switch';
import { useNotificationCenter } from '@/components/notification-center';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { useOnboardingStore } from '@/stores/onboarding';
import { useQueryClient } from '@tanstack/vue-query';
import { RocketIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const onboardingStore = useOnboardingStore();
const { isDismissed } = storeToRefs(onboardingStore);

const { data: userSettings, mutateAsync } = useUserSettings();

const includeCreditLimitInStats = computed(() => userSettings.value?.includeCreditLimitInStats ?? false);
const isUpdatingCreditLimitSetting = ref(false);

const handleCreditLimitToggle = async (value: boolean) => {
  isUpdatingCreditLimitSetting.value = true;
  try {
    await mutateAsync({
      ...userSettings.value,
      includeCreditLimitInStats: value,
    });

    addSuccessNotification(t('settings.preferences.balanceStats.creditLimit.successNotification'));

    // Invalidate all balance-related queries so they refetch with the new setting
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrend] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrendPrev] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTotalBalance] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalancePreviousBalance] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsBalanceHistoryTrend] }),
    ]);
  } catch {
    addErrorNotification(t('settings.preferences.balanceStats.creditLimit.errorNotification'));
  } finally {
    isUpdatingCreditLimitSetting.value = false;
  }
};

const isReopening = ref(false);

const handleReopenQuickStart = async () => {
  isReopening.value = true;
  try {
    await onboardingStore.reopen();
    onboardingStore.openPanel();
  } finally {
    isReopening.value = false;
  }
};
</script>
