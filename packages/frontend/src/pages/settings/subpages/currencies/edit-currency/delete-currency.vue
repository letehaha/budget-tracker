<template>
  <div class="flex items-center justify-between gap-4">
    <p class="text-sm opacity-90">
      Currency can only be deleted/disconnected if there's no accounts and/or transactions associated with it.
    </p>

    <ui-tooltip :content="isDeletionDisabled ? DISABLED_DELETE_TEXT : ''" position="top">
      <Button variant="destructive" :disabled="isDeletionDisabled || isFormDisabled" @click="deleteCurrency">
        Delete currency

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

import { CurrencyWithExchangeRate } from '../types';

const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const accountsStore = useAccountsStore();
const { accountsCurrencyCodes } = storeToRefs(accountsStore);
const DISABLED_DELETE_TEXT = 'You cannot delete this currency because it is still connected to account(s).';

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
    addSuccessNotification('Successfully deleted.');
    emit('submit');
    emit('trigger-disabled', false);
  },
  onError: (e) => {
    if (e instanceof ApiErrorResponseError) {
      if (e.data.code === API_ERROR_CODES.unauthorized) return;
      if (e.data.code === API_ERROR_CODES.validationError) {
        addErrorNotification(e.data.message);
        return;
      }
    }
    addErrorNotification('Unexpected error. Currency is not deleted.');
  },
});

const isFormDisabled = computed(() => props.isFormDisabled || isDeleting.value);
</script>
