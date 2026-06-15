<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useResetPayeeLogo, useUpdatePayee } from '@/composable/data-queries/payees';
import { captureException } from '@/lib/sentry';
import { RotateCcwIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import PayeeLogoSearch from './payee-logo-search.vue';

const props = defineProps<{
  open: boolean;
  payeeId: string;
  payeeName: string;
  /** The payee's current logo domain, so the panel highlights it as selected. */
  currentDomain: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
}>();

const { t } = useI18n({ useScope: 'global' });
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const isOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
});

const updateMut = useUpdatePayee();
const resetMut = useResetPayeeLogo();

async function handlePickDomain(domain: string) {
  try {
    await updateMut.mutateAsync({ id: props.payeeId, payload: { logoDomain: domain } });
    addSuccessNotification(t('payees.logo.updatedToast'));
    isOpen.value = false;
  } catch (error) {
    captureException({ error, context: { flow: 'setPayeeLogo' } });
    addErrorNotification(t('payees.errors.generic'));
  }
}

async function handleReset() {
  try {
    await resetMut.mutateAsync({ id: props.payeeId });
    addSuccessNotification(t('payees.logo.resetToast'));
    isOpen.value = false;
  } catch (error) {
    captureException({ error, context: { flow: 'resetPayeeLogo' } });
    addErrorNotification(t('payees.errors.generic'));
  }
}

const isSubmitting = computed(() => updateMut.isPending.value || resetMut.isPending.value);
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>
      <span class="text-lg font-semibold">{{ $t('payees.logo.dialogTitle') }}</span>
    </template>
    <template #description>{{ $t('payees.logo.dialogDescription') }}</template>

    <template #default>
      <div class="flex flex-col gap-4 p-4">
        <div class="border-input overflow-hidden rounded-md border">
          <PayeeLogoSearch
            :model-value="currentDomain"
            :name-for-search="payeeName"
            @update:model-value="handlePickDomain"
          />
        </div>

        <!-- Footer actions -->
        <div class="flex items-center justify-between gap-2 border-t pt-2">
          <Button
            variant="ghost"
            size="sm"
            :disabled="isSubmitting"
            :loading="resetMut.isPending.value"
            @click="handleReset"
          >
            <RotateCcwIcon class="size-4" />
            {{ $t('payees.logo.resetToAuto') }}
          </Button>
          <Button variant="ghost" :disabled="isSubmitting" @click="isOpen = false">
            {{ $t('common.actions.cancel') }}
          </Button>
        </div>
      </div>
    </template>
  </ResponsiveDialog>
</template>
