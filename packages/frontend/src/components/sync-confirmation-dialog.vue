<template>
  <AlertDialog.AlertDialog :open="open" @update:open="$emit('update:open', $event)">
    <AlertDialog.AlertDialogContent>
      <AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogTitle>Sync Recently Completed</AlertDialog.AlertDialogTitle>
        <AlertDialog.AlertDialogDescription>
          You synchronized your accounts {{ timeSinceLastSyncText }} ago. Are you sure you want to sync again?
        </AlertDialog.AlertDialogDescription>
      </AlertDialog.AlertDialogHeader>
      <AlertDialog.AlertDialogFooter>
        <AlertDialog.AlertDialogAction variant="default" @click="$emit('confirm')">
          Sync Anyway
        </AlertDialog.AlertDialogAction>
        <AlertDialog.AlertDialogCancel>Cancel</AlertDialog.AlertDialogCancel>
      </AlertDialog.AlertDialogFooter>
    </AlertDialog.AlertDialogContent>
  </AlertDialog.AlertDialog>
</template>

<script setup lang="ts">
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import { computed } from 'vue';

const props = defineProps<{
  open: boolean;
  lastSyncTimestamp: number | null;
}>();

defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
}>();

const timeSinceLastSyncText = computed(() => {
  if (!props.lastSyncTimestamp) return 'some time';

  const diffMs = Date.now() - props.lastSyncTimestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  }
  return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`;
});
</script>
