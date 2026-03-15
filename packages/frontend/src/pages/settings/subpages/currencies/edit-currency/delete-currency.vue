<template>
  <div class="flex items-center justify-between gap-4">
    <p class="text-sm opacity-90">
      {{ $t('settings.currencies.delete.description') }}
    </p>

    <ui-tooltip :content="isDeletionDisabled ? $t('settings.currencies.delete.disabledTooltip') : ''" position="top">
      <Button variant="destructive" :disabled="isDeletionDisabled || isFormDisabled" @click="deleteCurrency">
        {{ $t('settings.currencies.delete.button') }}

        <InfoIcon class="size-4" v-if="isDeletionDisabled" />
      </Button>
    </ui-tooltip>
  </div>
</template>

<script setup lang="ts">
import { deleteUserCurrency } from '@/api/currencies';
import UiTooltip from '@/components/common/tooltip.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { useAccountsStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { useMutation } from '@tanstack/vue-query';
import { InfoIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { CurrencyWithExchangeRate } from '../types';

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const { accountsCurrencyCodes } = storeToRefs(accountsStore);
const { t } = useI18n();

const props = defineProps<{
  currency: CurrencyWithExchangeRate;
  isFormDisabled: boolean;
}>();

const isDeletionDisabled = computed(() => accountsCurrencyCodes.value.includes(props.currency.currencyCode));

const emit = defineEmits<{
  submit: [];
  'trigger-disabled': [value: boolean];
}>();

const { isPending: isDeleting, mutate: deleteCurrency } = useMutation({
  mutationFn: () => {
    emit('trigger-disabled', true);
    return deleteUserCurrency(props.currency.currencyCode);
  },
  onSuccess: () => {
    addSuccessNotification(t('settings.currencies.delete.successfullyDeleted'));
    emit('submit');
    emit('trigger-disabled', false);
  },
  onError: (e) => {
    if (e instanceof ApiErrorResponseError) {
      if (e.data.code === API_ERROR_CODES.unauthorized) return;
      if (e.data.code === API_ERROR_CODES.validationError) {
        addErrorNotification(e.data.message ?? '');
        return;
      }
    }
    addErrorNotification(t('settings.currencies.delete.errors.deleteFailed'));
  },
});

const isFormDisabled = computed(() => props.isFormDisabled || isDeleting.value);
</script>
