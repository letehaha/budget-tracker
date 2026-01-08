<script setup lang="ts">
import { Switch } from '@/components/lib/ui/switch';
import * as Tooltip from '@/components/lib/ui/tooltip';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { debounce } from 'lodash-es';
import { InfoIcon } from 'lucide-vue-next';
import { computed, reactive, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  account: AccountModel;
}>();

const { addNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();

const form = reactive({
  isEnabled: false,
});

const updateVisibility = async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
  try {
    await accountsStore.editAccount({ id, isEnabled });

    addNotification({
      text: t('pages.account.visibility.updateSuccess'),
      type: NotificationType.success,
    });
  } catch {
    addNotification({
      text: t('pages.account.visibility.unexpectedError'),
      type: NotificationType.error,
    });
    form.isEnabled = !form.isEnabled;
  }
};

const debouncedUpdateMonoAccHandler = debounce(updateVisibility, 1000);

watchEffect(() => {
  if (props.account) {
    form.isEnabled = props.account.isEnabled;
  }
});

// Inverted value to represent "hidden" label
// - Switch ON = account is hidden (isEnabled: false)
// - Switch OFF = account is visible (isEnabled: true)
const isHidden = computed({
  get: () => !form.isEnabled,
  set: (value: boolean) => {
    form.isEnabled = !value;
  },
});

watch(
  () => form.isEnabled,
  (value) => {
    if (value !== props.account.isEnabled) {
      debouncedUpdateMonoAccHandler({
        id: props.account.id,
        isEnabled: value,
      });
    }
  },
);
</script>

<template>
  <div class="flex items-center justify-between gap-2">
    <span class="flex items-center gap-2">
      {{ t('pages.account.visibility.label') }}

      <Tooltip.TooltipProvider>
        <Tooltip.Tooltip>
          <Tooltip.TooltipTrigger>
            <InfoIcon class="text-primary size-4" />
          </Tooltip.TooltipTrigger>
          <Tooltip.TooltipContent class="max-w-[400px] p-4">
            <span class="text-sm leading-6 opacity-90">
              {{ t('pages.account.visibility.tooltip') }}
            </span>
          </Tooltip.TooltipContent>
        </Tooltip.Tooltip>
      </Tooltip.TooltipProvider>
    </span>

    <Switch v-model:model-value="isHidden" />
  </div>
</template>
