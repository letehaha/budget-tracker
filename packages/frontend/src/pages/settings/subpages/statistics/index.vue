<template>
  <Card class="max-w-4xl">
    <CardHeader class="border-b">
      <h2 class="mb-2 text-2xl font-semibold">{{ $t('settings.statistics.title') }}</h2>
      <p class="text-sm opacity-80">{{ $t('settings.statistics.description') }}</p>
    </CardHeader>

    <CardContent class="mt-6">
      <div class="flex items-center justify-between gap-4">
        <div class="flex-1">
          <div class="text-sm font-medium">
            {{ $t('settings.statistics.creditLimit.label') }}
          </div>
          <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
            {{ $t('settings.statistics.creditLimit.description') }}
          </p>
        </div>
        <Switch
          :model-value="includeCreditLimitInStats"
          :disabled="isUpdating"
          @update:model-value="handleCreditLimitToggle"
        />
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { Card, CardContent, CardHeader } from '@/components/lib/ui/card';
import { Switch } from '@/components/lib/ui/switch';
import { useNotificationCenter } from '@/components/notification-center';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { useQueryClient } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const queryClient = useQueryClient();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { data: userSettings, mutateAsync, isUpdating } = useUserSettings();

const includeCreditLimitInStats = computed(() => userSettings.value?.includeCreditLimitInStats ?? false);

const handleCreditLimitToggle = async (value: boolean) => {
  try {
    await mutateAsync({
      ...userSettings.value,
      includeCreditLimitInStats: value,
    });

    addSuccessNotification(t('settings.statistics.creditLimit.successNotification'));

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrend] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTrendPrev] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalanceTotalBalance] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.widgetBalancePreviousBalance] }),
      queryClient.invalidateQueries({ queryKey: [...VUE_QUERY_CACHE_KEYS.analyticsBalanceHistoryTrend] }),
    ]);
  } catch {
    addErrorNotification(t('settings.statistics.creditLimit.errorNotification'));
  }
};
</script>
