<template>
  <AlertDialog.AlertDialog v-model:open="isOpen">
    <AlertDialog.AlertDialogContent>
      <AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogTitle>Reconnect Integration</AlertDialog.AlertDialogTitle>
        <AlertDialog.AlertDialogDescription>
          By starting the reconnection flow,
          <span class="text-destructive-text font-semibold"
            >your current connection will immediately become invalid</span
          >. You must finish the flow to make the connection active again.
        </AlertDialog.AlertDialogDescription>
      </AlertDialog.AlertDialogHeader>

      <AlertDialog.AlertDialogFooter>
        <AlertDialog.AlertDialogAction variant="destructive" :disabled="isPending" @click="handleConfirm">
          {{ isPending ? 'Preparing...' : 'Continue' }}
        </AlertDialog.AlertDialogAction>

        <AlertDialog.AlertDialogCancel>{{ $t('common.actions.cancel') }}</AlertDialog.AlertDialogCancel>
      </AlertDialog.AlertDialogFooter>
    </AlertDialog.AlertDialogContent>
  </AlertDialog.AlertDialog>
</template>

<script lang="ts" setup>
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import { ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  isPending?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [];
}>();

const isOpen = ref(props.open);

watch(
  () => props.open,
  (newValue) => {
    isOpen.value = newValue;
  },
);

watch(isOpen, (newValue) => {
  emit('update:open', newValue);
});

const handleConfirm = () => {
  emit('confirm');
};
</script>
