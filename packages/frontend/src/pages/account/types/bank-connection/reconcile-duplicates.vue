<template>
  <div class="flex items-center justify-between gap-2">
    <div>
      <p>{{ $t('pages.account.reconcileDuplicates.title') }}</p>
      <p class="text-muted-foreground text-sm">{{ $t('pages.account.reconcileDuplicates.description') }}</p>
    </div>

    <Button :disabled="isPending" class="min-w-25" size="sm" variant="outline" @click="isConfirmOpen = true">
      <CombineIcon class="size-4" />
      {{ isPending ? $t('pages.account.reconcileDuplicates.running') : $t('pages.account.reconcileDuplicates.button') }}
    </Button>

    <ResponsiveAlertDialog
      v-model:open="isConfirmOpen"
      :confirm-label="$t('pages.account.reconcileDuplicates.confirm')"
      confirm-variant="destructive"
      @confirm="mutate()"
    >
      <template #title>{{ $t('pages.account.reconcileDuplicates.confirmTitle') }}</template>
      <template #description>{{ $t('pages.account.reconcileDuplicates.confirmDescription') }}</template>
    </ResponsiveAlertDialog>
  </div>
</template>

<script lang="ts" setup>
import { reconcileDuplicates } from '@/api/bank-data-providers';
import { VUE_QUERY_GLOBAL_PREFIXES } from '@/common/const';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { AccountModel } from '@bt/shared/types';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { CombineIcon } from '@lucide/vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  account: AccountModel;
}>();

const queryClient = useQueryClient();
const { addNotification } = useNotificationCenter();
const isConfirmOpen = ref(false);

const { mutate, isPending } = useMutation({
  mutationFn: () => {
    const connectionId = props.account.bankDataProviderConnectionId;
    if (!connectionId) throw new Error(t('pages.account.syncTransactions.notLinked'));
    return reconcileDuplicates({ connectionId, accountId: props.account.id });
  },
  onSuccess: ({ mergedCount, skippedCount }) => {
    addNotification({
      text: t('pages.account.reconcileDuplicates.result', { merged: mergedCount, skipped: skippedCount }),
      type: NotificationType.success,
    });
    queryClient.invalidateQueries({ queryKey: [VUE_QUERY_GLOBAL_PREFIXES.transactionChange] });
  },
  onError: (error: unknown) => {
    console.error(error);
    const e = error as { data?: { message?: string } };
    addNotification({
      text: e?.data?.message || t('pages.account.reconcileDuplicates.failed'),
      type: NotificationType.error,
    });
  },
});
</script>
