<script setup lang="ts">
import { MONOBANK_API_TOKEN_LENGTH } from '@/common/const';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useFormValidation } from '@/composable';
import { ApiErrorResponseError } from '@/js/errors';
import { minLength, required } from '@/js/helpers/validators';
import { useBanksMonobankStore, useCurrenciesStore } from '@/stores';
import { API_ERROR_CODES } from '@bt/shared/types';
import { reactive, ref } from 'vue';

defineOptions({
  name: 'monobank-set-token',
});

const props = withDefaults(
  defineProps<{
    isUpdate?: boolean;
  }>(),
  {
    isUpdate: false,
  },
);

const emit = defineEmits(['set']);
const monobankStore = useBanksMonobankStore();
const currenciesStore = useCurrenciesStore();
const { addNotification } = useNotificationCenter();

const isDialogOpen = ref(false);
const isLoading = ref(false);
const form = reactive({ token: '' });
const { isFormValid, getFieldErrorMessage } = useFormValidation(
  { form },
  {
    form: {
      token: {
        required,
        apiToken: minLength(MONOBANK_API_TOKEN_LENGTH),
      },
    },
  },
  undefined,
  {
    customValidationMessages: {
      apiToken: `Monobank API token should be ${MONOBANK_API_TOKEN_LENGTH} characters length`,
    },
  },
);

const submit = async () => {
  try {
    if (!isFormValid()) return;

    isLoading.value = true;

    if (props.isUpdate) {
      await monobankStore.updateUser({ token: form.token });
    } else {
      await monobankStore.pairAccount({ token: form.token });
    }

    await currenciesStore.loadCurrencies();

    addNotification({
      text: 'Paired',
      type: NotificationType.success,
    });

    isDialogOpen.value = false;
    emit('set');
  } catch (e) {
    if (e instanceof ApiErrorResponseError) {
      if (e.data.code === API_ERROR_CODES.monobankUserAlreadyConnected) {
        addNotification({
          text: 'Account already connected',
          type: NotificationType.error,
        });

        return;
      }
    }

    addNotification({
      text: 'Unexpected error',
      type: NotificationType.error,
    });
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="isDialogOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>
      {{ isUpdate ? 'Update your Monobank API Token' : 'Set Monobank API Token' }}
    </template>

    <form class="grid gap-6" data-cy="monobank-set-token-modal" @submit.prevent="submit">
      <p>
        Please visit
        <a href="https://api.monobank.ua/" target="_blank" rel="noopener noreferrer" class="text-primary">
          https://api.monobank.ua/
        </a>

        and follow all the instructions. Paste the API token from Monobank in the field below
      </p>
      <div>
        <input-field
          v-model="form.token"
          name="token"
          label="API Token"
          placeholder="uBrAYwEg6H..."
          :error-message="getFieldErrorMessage('form.token')"
        />
      </div>

      <div class="flex">
        <Button type="submit" class="w-full" :disabled="isLoading">
          <template v-if="isUpdate"> Update token </template>
          <template v-else> Pair account </template>
        </Button>
      </div>
    </form>
  </ResponsiveDialog>
</template>
