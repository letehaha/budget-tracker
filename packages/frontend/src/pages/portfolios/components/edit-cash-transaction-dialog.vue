<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>{{ $t('portfolioDetail.cashBalances.cashTransactions.editDialog.title') }}</template>
    <template #description>
      {{ $t('portfolioDetail.cashBalances.cashTransactions.editDialog.description') }}
    </template>

    <label class="flex cursor-pointer items-start gap-3 py-2">
      <Checkbox v-model="isAdjustment" :disabled="adjustmentMutation.isPending.value" class="mt-0.5 shrink-0" />
      <span class="grid gap-1">
        <span class="text-sm leading-none font-medium">
          {{ $t('forms.directCashTransaction.adjustmentLabel') }}
        </span>
        <span class="text-muted-foreground text-xs">
          {{ $t('forms.directCashTransaction.adjustmentHint') }}
        </span>
      </span>
    </label>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UiButton variant="outline" :disabled="adjustmentMutation.isPending.value" @click="isOpen = false">
          {{ $t('forms.directCashTransaction.cancelButton') }}
        </UiButton>
        <UiButton
          :disabled="!hasChanges || adjustmentMutation.isPending.value"
          :loading="adjustmentMutation.isPending.value"
          @click="handleSave"
        >
          {{ $t('portfolioDetail.cashBalances.cashTransactions.editDialog.save') }}
        </UiButton>
      </div>
    </template>
  </ResponsiveDialog>
</template>

<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useSetTransferAdjustment } from '@/composable/data-queries/portfolio-transfers';
import type { PortfolioTransferModel } from '@bt/shared/types/investments';
import { useVModel } from '@vueuse/core';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  open: boolean;
  portfolioId: string;
  transfer: PortfolioTransferModel | null;
}>();

const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const { t } = useI18n();
const { addNotification } = useNotificationCenter();
const adjustmentMutation = useSetTransferAdjustment();

const isOpen = useVModel(props, 'open', emit, { passive: true });
const isAdjustment = ref(false);

// The dialog is kept mounted across rows, so each open re-seeds the draft from
// whichever transfer is now being edited.
watch(
  () => [props.open, props.transfer] as const,
  ([open, transfer]) => {
    if (open && transfer) isAdjustment.value = transfer.isAdjustment;
  },
  { immediate: true },
);

const hasChanges = computed(() => !!props.transfer && props.transfer.isAdjustment !== isAdjustment.value);

const handleSave = async () => {
  if (!props.transfer) return;

  try {
    await adjustmentMutation.mutateAsync({
      portfolioId: props.portfolioId,
      transferId: props.transfer.id,
      isAdjustment: isAdjustment.value,
    });

    addNotification({
      text: isAdjustment.value
        ? t('portfolioDetail.cashBalances.cashTransactions.markedAsAdjustment')
        : t('portfolioDetail.cashBalances.cashTransactions.markedAsContribution'),
      type: NotificationType.success,
    });

    isOpen.value = false;
  } catch (error) {
    addNotification({
      text: error instanceof Error ? error.message : t('portfolioDetail.cashBalances.cashTransactions.adjustmentError'),
      type: NotificationType.error,
    });
  }
};
</script>
