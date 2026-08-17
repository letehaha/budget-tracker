<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('pages.integrations.dialogs.editName.title') }}</DialogTitle>
        <DialogDescription>{{ t('pages.integrations.dialogs.editName.description') }}</DialogDescription>
      </DialogHeader>

      <div class="py-4">
        <InputField
          v-model="localProviderName"
          :label="t('pages.integrations.dialogs.editName.label')"
          :placeholder="$t('pages.connectionName.placeholder')"
          @keyup.enter="handleSave"
        />
      </div>

      <DialogFooter class="gap-2 sm:gap-4">
        <UiButton variant="outline" @click="handleCancel" :disabled="isSaving">
          {{ $t('common.actions.cancel') }}
        </UiButton>
        <UiButton @click="handleSave" :disabled="!localProviderName.trim() || isSaving">
          {{
            isSaving ? t('pages.integrations.dialogs.editName.saving') : t('pages.integrations.dialogs.editName.save')
          }}
        </UiButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/lib/ui/dialog';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  providerName: string;
  isSaving?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  save: [providerName: string];
}>();

const isOpen = ref(props.open);
const localProviderName = ref(props.providerName);

watch(
  () => props.open,
  (newValue) => {
    isOpen.value = newValue;
    // Reset the local value when dialog opens
    if (newValue) {
      localProviderName.value = props.providerName;
    }
  },
);

watch(
  () => props.providerName,
  (newValue) => {
    localProviderName.value = newValue;
  },
);

watch(isOpen, (newValue) => {
  emit('update:open', newValue);
});

const handleSave = () => {
  if (localProviderName.value.trim()) {
    emit('save', localProviderName.value.trim());
  }
};

const handleCancel = () => {
  isOpen.value = false;
};
</script>
