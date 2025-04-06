<script setup lang="ts">
import { Switch } from '@/components/lib/ui/switch';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { debounce } from 'lodash-es';
import { reactive, watch, watchEffect } from 'vue';

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
      text: 'Updated successfully',
      type: NotificationType.success,
    });
  } catch {
    addNotification({
      text: 'Unexpected error',
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
  { immediate: true },
);
</script>

<template>
  <div class="flex items-center justify-between gap-2">
    <span> Make this account visible on the Dashboard: </span>

    <Switch v-model:checked="form.isEnabled" />
  </div>
</template>
