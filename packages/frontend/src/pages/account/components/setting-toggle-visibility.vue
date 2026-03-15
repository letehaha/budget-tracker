<script setup lang="ts">
import { Switch } from '@/components/lib/ui/switch';
import * as Tooltip from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { debounce } from 'lodash-es';
import { InfoIcon } from 'lucide-vue-next';
import { reactive, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  account: AccountModel;
}>();

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();

const form = reactive({
  excludeFromStats: false,
});

const updateExcludeFromStats = async ({ id, excludeFromStats }: { id: number; excludeFromStats: boolean }) => {
  try {
    await accountsStore.editAccount({ id, excludeFromStats });

    addSuccessNotification(t('pages.account.visibility.updateSuccess'));
  } catch {
    addErrorNotification(t('pages.account.visibility.unexpectedError'));
    form.excludeFromStats = !form.excludeFromStats;
  }
};

const debouncedHandler = debounce(updateExcludeFromStats, 1000);

watchEffect(() => {
  if (props.account) {
    form.excludeFromStats = props.account.excludeFromStats;
  }
});

watch(
  () => form.excludeFromStats,
  (value) => {
    if (value !== props.account.excludeFromStats) {
      debouncedHandler({
        id: props.account.id,
        excludeFromStats: value,
      });
    }
  },
);
</script>

<template>
  <div class="flex items-center justify-between gap-2">
    <span class="flex items-center gap-2">
      {{ t('pages.account.excludeFromStats.label') }}

      <Tooltip.TooltipProvider>
        <Tooltip.Tooltip>
          <Tooltip.TooltipTrigger>
            <InfoIcon class="text-primary size-4" />
          </Tooltip.TooltipTrigger>
          <Tooltip.TooltipContent class="max-w-[400px] p-4">
            <span class="text-sm leading-6 opacity-90">
              {{ t('pages.account.excludeFromStats.tooltip') }}
            </span>
          </Tooltip.TooltipContent>
        </Tooltip.Tooltip>
      </Tooltip.TooltipProvider>
    </span>

    <Switch v-model:model-value="form.excludeFromStats" />
  </div>
</template>
