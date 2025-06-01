<template>
  <div>
    <h3>Please define your API keys</h3>
    <input-field v-model="form.public" label="Public Key" :error-message="getFieldErrorMessage('form.public')" />
    <input-field v-model="form.secret" label="Secret Key" :error-message="getFieldErrorMessage('form.secret')" />

    <Button :disabled="isFormLoading" @click="submit">
      {{ isFormLoading ? 'Loading...' : 'Submit' }}
    </Button>
  </div>
</template>

<script lang="ts" setup>
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { useFormValidation } from '@/composable';
import { required } from '@/js/helpers/validators';
import { useCryptoBinanceStore } from '@/stores';
import { ref } from 'vue';

const cryptoBinanceStore = useCryptoBinanceStore();

const isFormLoading = ref(false);
const form = ref({
  public: '',
  secret: '',
});

const { isFormValid, getFieldErrorMessage, resetValidation } = useFormValidation(
  { form },
  {
    form: {
      public: { required },
      secret: { required },
    },
  },
);

const submit = async (): Promise<undefined> => {
  if (!isFormValid()) return undefined;

  isFormLoading.value = true;

  try {
    await cryptoBinanceStore.setSettings({
      publicKey: form.value.public,
      secretKey: form.value.secret,
    });

    form.value = {
      public: '',
      secret: '',
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e);
  } finally {
    isFormLoading.value = false;
    resetValidation();
  }

  return undefined;
};
</script>
