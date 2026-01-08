<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import CreateAccountForm from '@/components/forms/create-account-form.vue';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { ref } from 'vue';

const emit = defineEmits(['created']);

const isOpen = ref(false);

const onAccountCreation = () => {
  isOpen.value = false;
  isMobileSheetOpen.value = false;
  emit('created');
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title> {{ $t('common.dialogs.createAccount') }} </template>

    <CreateAccountForm @created="onAccountCreation" />
  </ResponsiveDialog>
</template>
