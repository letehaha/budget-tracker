<template>
  <AlertDialog.AlertDialog v-model:open="isOpen">
    <AlertDialog.AlertDialogContent>
      <AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogTitle>
          {{ t('pages.integrations.dialogs.disconnect.title') }}
        </AlertDialog.AlertDialogTitle>
        <AlertDialog.AlertDialogDescription>
          {{ t('pages.integrations.dialogs.disconnect.description') }}
        </AlertDialog.AlertDialogDescription>
      </AlertDialog.AlertDialogHeader>

      <div class="py-4">
        <label class="flex cursor-pointer items-center gap-3">
          <Checkbox v-model="removeAssociatedAccounts" />

          <div class="flex flex-col gap-1">
            <span class="text-sm font-medium">{{ t('pages.integrations.dialogs.disconnect.removeAccounts') }}</span>
            <span class="text-muted-foreground text-xs">
              {{ t('pages.integrations.dialogs.disconnect.removeAccountsHint') }}
            </span>
          </div>
        </label>
      </div>

      <AlertDialog.AlertDialogFooter>
        <AlertDialog.AlertDialogCancel>{{ $t('common.actions.cancel') }}</AlertDialog.AlertDialogCancel>
        <AlertDialog.AlertDialogAction variant="destructive" :disabled="isDisconnecting" @click="handleConfirm">
          {{
            isDisconnecting
              ? t('pages.integrations.dialogs.disconnect.disconnecting')
              : t('pages.integrations.dialogs.disconnect.disconnect')
          }}
        </AlertDialog.AlertDialogAction>
      </AlertDialog.AlertDialogFooter>
    </AlertDialog.AlertDialogContent>
  </AlertDialog.AlertDialog>
</template>

<script lang="ts" setup>
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
