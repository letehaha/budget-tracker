<script lang="ts" setup>
import Button from '@/components/lib/ui/button/Button.vue';
import ResponsiveAlertDialog from '@/components/common/responsive-alert-dialog.vue';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const emit = defineEmits<{
  dismiss: [];
}>();

const isConfirmOpen = ref(false);

const handleDismissClick = () => {
  isConfirmOpen.value = true;
};

const handleConfirm = () => {
  isConfirmOpen.value = false;
  emit('dismiss');
};
</script>

<template>
  <div class="border-t p-4">
    <Button variant="ghost-destructive" class="w-full" @click="handleDismissClick">
      {{ t('dashboard.onboarding.quickStart.ui.dismissButton') }}
    </Button>

    <ResponsiveAlertDialog
      v-model:open="isConfirmOpen"
      :confirm-label="t('dashboard.onboarding.quickStart.ui.dismissConfirmButton')"
      confirm-variant="destructive"
      @confirm="handleConfirm"
    >
      <template #title>
        {{ t('dashboard.onboarding.quickStart.ui.dismissConfirmTitle') }}
      </template>
      <template #description>
        {{ t('dashboard.onboarding.quickStart.ui.dismissConfirmDescription') }}
      </template>
    </ResponsiveAlertDialog>
  </div>
</template>
