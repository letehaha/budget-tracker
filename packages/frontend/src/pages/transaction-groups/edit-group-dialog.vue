<script setup lang="ts">
import * as transactionGroupsApi from '@/api/transaction-groups';
import type { TransactionGroupResponse } from '@/api/transaction-groups';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import InputField from '@/components/fields/input-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import { SaveIcon } from 'lucide-vue-next';
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  open?: boolean;
  group: TransactionGroupResponse | null;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  saved: [];
}>();

const form = reactive({ name: '', note: '' as string | undefined });

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && props.group) {
      form.name = props.group.name;
      form.note = props.group.note ?? '';
    }
  },
);

const save = async () => {
  if (!props.group || !form.name.trim()) return;
  await transactionGroupsApi.updateTransactionGroup({
    id: props.group.id,
    payload: {
      name: form.name.trim(),
      note: form.note?.trim() || null,
    },
  });
  emit('update:open', false);
  emit('saved');
};
</script>

<template>
  <ResponsiveDialog :open="open" @update:open="emit('update:open', $event)">
    <template #title>{{ t('transactions.transactionGroups.groupDialog.editTitle') }}</template>
    <template #description />

    <div class="space-y-3 py-2">
      <InputField v-model="form.name" :label="t('transactions.transactionGroups.groupDialog.nameLabel')" />
      <TextareaField
        v-model="form.note"
        :label="t('transactions.transactionGroups.groupDialog.noteLabel')"
        :rows="2"
        :placeholder="t('transactions.transactionGroups.groupDialog.notePlaceholder')"
      />
      <div class="flex gap-2">
        <Button size="sm" @click="save">
          <SaveIcon class="mr-1 size-3.5" />
          {{ t('transactions.transactionGroups.groupDialog.savingAction') }}
        </Button>
        <Button variant="ghost" size="sm" @click="emit('update:open', false)">
          {{ t('transactions.transactionGroups.groupDialog.cancelButton') }}
        </Button>
      </div>
    </div>
  </ResponsiveDialog>
</template>
