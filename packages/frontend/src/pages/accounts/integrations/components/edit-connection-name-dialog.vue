<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Connection Name</DialogTitle>
        <DialogDescription> Give your connection a custom name to easily identify it. </DialogDescription>
      </DialogHeader>

      <div class="py-4">
        <label class="mb-2 block text-sm font-medium">Connection Name</label>
        <input
          v-model="localProviderName"
          type="text"
          class="w-full rounded-md border px-3 py-2"
          placeholder="e.g., Personal Account"
          @keyup.enter="handleSave"
        />
      </div>

      <DialogFooter class="gap-2 sm:gap-0">
        <UiButton variant="outline" @click="handleCancel" :disabled="isSaving">Cancel</UiButton>
        <UiButton @click="handleSave" :disabled="!localProviderName.trim() || isSaving">
          {{ isSaving ? 'Saving...' : 'Save' }}
        </UiButton>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
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
