<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import CreateAccountForm from '@/components/forms/create-account-form.vue';
import { isMobileSheetOpen } from '@/composable/global-state/mobile-sheet';
import { trackAnalyticsEvent } from '@/lib/posthog';
import { ref, watch } from 'vue';

const emit = defineEmits(['created']);

const isOpen = ref(false);

watch(isOpen, (open) => {
  if (open) {
    trackAnalyticsEvent({ event: 'account_creation_opened' });
  }
});

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
