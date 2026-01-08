<template>
  <AlertDialog.AlertDialog :open="open" @update:open="$emit('update:open', $event)">
    <AlertDialog.AlertDialogContent>
      <AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogTitle>{{ $t('dialogs.syncConfirmation.title') }}</AlertDialog.AlertDialogTitle>
        <AlertDialog.AlertDialogDescription>
          {{ $t('dialogs.syncConfirmation.description', { time: timeSinceLastSyncText }) }}
        </AlertDialog.AlertDialogDescription>
      </AlertDialog.AlertDialogHeader>
      <AlertDialog.AlertDialogFooter>
        <AlertDialog.AlertDialogAction variant="default" @click="$emit('confirm')">
          {{ $t('dialogs.syncConfirmation.syncAnyway') }}
        </AlertDialog.AlertDialogAction>
        <AlertDialog.AlertDialogCancel>{{ $t('dialogs.syncConfirmation.cancel') }}</AlertDialog.AlertDialogCancel>
      </AlertDialog.AlertDialogFooter>
    </AlertDialog.AlertDialogContent>
  </AlertDialog.AlertDialog>
</template>

<script setup lang="ts">
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  lastSyncTimestamp: number | null;
}>();

defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
}>();

const timeSinceLastSyncText = computed(() => {
  if (!props.lastSyncTimestamp) return t('dialogs.syncConfirmation.timeUnits.someTime');

  const diffMs = Date.now() - props.lastSyncTimestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours > 0) {
    return t('dialogs.syncConfirmation.timeUnits.hours', diffHours);
  }
  return t('dialogs.syncConfirmation.timeUnits.minutes', diffMinutes);
});
</script>
