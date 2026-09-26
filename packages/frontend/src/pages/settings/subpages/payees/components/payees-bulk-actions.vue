<template>
  <div
    :class="
      cn(
        'flex items-center gap-2',
        variant === 'bottom'
          ? 'bg-card/95 sticky bottom-0 z-10 mt-2 rounded-md border px-3 py-2 backdrop-blur'
          : 'bg-muted/40 min-h-12 flex-wrap gap-x-3 gap-y-1.5 border-b px-3 py-2',
      )
    "
  >
    <span v-if="variant === 'top'" class="text-sm whitespace-nowrap">
      {{ $t('payees.bulk.selectedCount', { count: selectedIds.length }) }}
    </span>

    <div :class="cn('flex items-center gap-2', variant === 'bottom' ? 'flex-1' : 'ml-auto flex-wrap')">
      <UiButton
        variant="soft-destructive"
        size="sm"
        :class="cn(variant === 'bottom' && 'flex-1')"
        :disabled="isDisabled"
        @click="openConfirm(false)"
      >
        <Trash2Icon class="size-4" />
        {{ $t('payees.actions.delete') }}
      </UiButton>
      <UiButton
        variant="soft-destructive"
        size="sm"
        :class="cn(variant === 'bottom' && 'flex-1')"
        :disabled="isDisabled"
        @click="openConfirm(true)"
      >
        <ShieldOffIcon class="size-4" />
        {{ $t('payees.actions.deleteAndIgnore') }}
      </UiButton>
      <DesktopOnlyTooltip v-if="variant === 'top'" :content="$t('payees.bulk.clearSelection')">
        <UiButton
          variant="ghost"
          size="icon-sm"
          :class="cn(selectedIds.length === 0 && 'invisible')"
          :disabled="isPending"
          :aria-label="$t('payees.bulk.clearSelection')"
          @click="emit('clear')"
        >
          <XIcon class="size-4" />
        </UiButton>
      </DesktopOnlyTooltip>
    </div>

    <ResponsiveAlertDialog
      v-model:open="isConfirmOpen"
      :confirm-label="ignoreFuture ? $t('payees.actions.deleteAndIgnore') : $t('common.actions.delete')"
      confirm-variant="destructive"
      :confirm-disabled="isPending"
      @confirm="handleConfirm"
    >
      <template #title>
        {{
          ignoreFuture
            ? $t('payees.bulk.deleteAndIgnoreTitle', { count: selectedIds.length }, selectedIds.length)
            : $t('payees.bulk.deleteTitle', { count: selectedIds.length }, selectedIds.length)
        }}
      </template>
      <template #description>
        {{ ignoreFuture ? $t('payees.bulk.deleteAndIgnoreDescription') : $t('payees.bulk.deleteDescription') }}
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>

<script setup lang="ts">
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { Button as UiButton } from '@/components/lib/ui/button';
import { DesktopOnlyTooltip } from '@/components/lib/ui/tooltip';
import { useNotificationCenter } from '@/components/notification-center';
import { useBulkDeletePayees } from '@/composable/data-queries/payees';
import { ApiErrorResponseError } from '@/js/errors';
import { cn } from '@/lib/utils';
import { ShieldOffIcon, Trash2Icon, XIcon } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(defineProps<{ selectedIds: string[]; variant?: 'top' | 'bottom' }>(), {
  variant: 'top',
});
const emit = defineEmits<{ clear: [] }>();

const { t } = useI18n();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const bulkDelete = useBulkDeletePayees();
const isPending = computed(() => bulkDelete.isPending.value);
const isDisabled = computed(() => isPending.value || props.selectedIds.length === 0);

const isConfirmOpen = ref(false);
const ignoreFuture = ref(false);

const openConfirm = (withIgnore: boolean) => {
  ignoreFuture.value = withIgnore;
  isConfirmOpen.value = true;
};

async function handleConfirm() {
  try {
    const { deletedCount } = await bulkDelete.mutateAsync({ ids: props.selectedIds, ignoreFuture: ignoreFuture.value });
    addSuccessNotification(
      ignoreFuture.value
        ? t('payees.toasts.bulkDeletedAndIgnored', { count: deletedCount }, deletedCount)
        : t('payees.toasts.bulkDeleted', { count: deletedCount }, deletedCount),
    );
    emit('clear');
  } catch (err) {
    addErrorNotification(
      err instanceof ApiErrorResponseError
        ? err.data.message || t('payees.errors.generic')
        : t('payees.errors.generic'),
    );
  }
}
</script>
