<script lang="ts" setup>
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import type { BulkTransactionActions } from '@/composable/use-bulk-transaction-actions';

import AddToGroupDialog from './add-to-group-dialog.vue';
import BulkEditDialog from './bulk-edit-dialog.vue';
import CreateGroupDialog from './create-group-dialog.vue';

const props = defineProps<{
  /** The shared bulk-operations state from `useBulkTransactionActions` — the toolbar that opens these dialogs must use the same instance. */
  actions: BulkTransactionActions;
}>();

const {
  selectedCount,
  getSelectedTransactionIds,
  clearSelection,
  isBulkEditDialogOpen,
  isCreateGroupDialogOpen,
  isAddToGroupDialogOpen,
  isBulkDeleteDialogOpen,
  bulkUpdateMutation,
  bulkDeleteMutation,
  handleBulkApply,
  handleBulkDelete,
} = props.actions;
</script>

<template>
  <BulkEditDialog
    v-model:open="isBulkEditDialogOpen"
    :selected-count="selectedCount"
    :is-loading="bulkUpdateMutation.isPending.value"
    @apply="handleBulkApply"
  />

  <CreateGroupDialog
    v-model:open="isCreateGroupDialogOpen"
    :transaction-ids="getSelectedTransactionIds()"
    @created="clearSelection"
  />

  <AddToGroupDialog
    v-model:open="isAddToGroupDialogOpen"
    :transaction-ids="getSelectedTransactionIds()"
    @added="clearSelection"
  />

  <ResponsiveAlertDialog
    v-model:open="isBulkDeleteDialogOpen"
    :confirm-label="$t('transactions.bulkDelete.confirmButton')"
    confirm-variant="destructive"
    :confirm-disabled="bulkDeleteMutation.isPending.value"
    @confirm="handleBulkDelete"
  >
    <template #title>{{ $t('transactions.bulkDelete.confirmTitle', { count: selectedCount }) }}</template>
    <template #description>{{ $t('transactions.bulkDelete.confirmDescription') }}</template>
  </ResponsiveAlertDialog>
</template>
