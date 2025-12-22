<template>
  <AlertDialog.AlertDialog v-model:open="isOpen">
    <AlertDialog.AlertDialogContent>
      <AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogTitle>Disconnect Integration</AlertDialog.AlertDialogTitle>
        <AlertDialog.AlertDialogDescription>
          Are you sure you want to disconnect this integration? This action cannot be undone.
        </AlertDialog.AlertDialogDescription>
      </AlertDialog.AlertDialogHeader>

      <div class="py-4">
        <label class="flex cursor-pointer items-center gap-3">
          <Checkbox v-model="removeAssociatedAccounts" />

          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium">Also remove associated accounts</span>
            <span class="text-muted-foreground text-xs">
              This will permanently delete all accounts linked to this integration
            </span>
          </div>
        </label>
      </div>

      <AlertDialog.AlertDialogFooter>
        <AlertDialog.AlertDialogCancel>Cancel</AlertDialog.AlertDialogCancel>
        <AlertDialog.AlertDialogAction variant="destructive" :disabled="isDisconnecting" @click="handleConfirm">
          {{ isDisconnecting ? 'Disconnecting...' : 'Disconnect' }}
        </AlertDialog.AlertDialogAction>
      </AlertDialog.AlertDialogFooter>
    </AlertDialog.AlertDialogContent>
  </AlertDialog.AlertDialog>
</template>

<script lang="ts" setup>
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  isDisconnecting?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  confirm: [removeAssociatedAccounts: boolean];
}>();

const isOpen = ref(props.open);
const removeAssociatedAccounts = ref(false);

watch(
  () => props.open,
  (newValue) => {
    isOpen.value = newValue;
    // Reset checkbox when dialog opens
    if (newValue) {
      removeAssociatedAccounts.value = false;
    }
  },
);

watch(isOpen, (newValue) => {
  emit('update:open', newValue);
});

const handleConfirm = () => {
  emit('confirm', removeAssociatedAccounts.value);
};
</script>
