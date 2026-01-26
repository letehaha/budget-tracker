<template>
  <AlertDialog.AlertDialog v-model:open="isOpen">
    <AlertDialog.AlertDialogContent>
      <AlertDialog.AlertDialogHeader>
        <AlertDialog.AlertDialogTitle>
          {{ t('pages.integrations.dialogs.reconnect.title') }}
        </AlertDialog.AlertDialogTitle>
        <AlertDialog.AlertDialogDescription>
          <i18n-t keypath="pages.integrations.dialogs.reconnect.description" tag="span">
            <template #warning>
              <span class="text-destructive-text font-semibold">
                {{ t('pages.integrations.dialogs.reconnect.warning') }}
              </span>
            </template>
          </i18n-t>
        </AlertDialog.AlertDialogDescription>
      </AlertDialog.AlertDialogHeader>

      <AlertDialog.AlertDialogFooter>
        <AlertDialog.AlertDialogAction variant="destructive" :disabled="isPending" @click="handleConfirm">
          {{
            isPending
              ? t('pages.integrations.dialogs.reconnect.preparing')
              : t('pages.integrations.dialogs.reconnect.continue')
          }}
        </AlertDialog.AlertDialogAction>

        <AlertDialog.AlertDialogCancel>{{ $t('common.actions.cancel') }}</AlertDialog.AlertDialogCancel>
      </AlertDialog.AlertDialogFooter>
    </AlertDialog.AlertDialogContent>
  </AlertDialog.AlertDialog>
</template>

<script lang="ts" setup>
import * as AlertDialog from '@/components/lib/ui/alert-dialog';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
