<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useFormValidation } from '@/composable';
import { required } from '@/js/helpers/validators';
import { useBanksLunchflowStore } from '@/stores/integrations/banks/lunchflow';
import { reactive, ref } from 'vue';

defineOptions({
  name: 'lunchflow-set-token',
});

const emit = defineEmits(['connected']);
const lunchflowStore = useBanksLunchflowStore();
const { addNotification } = useNotificationCenter();

const isDialogOpen = ref(false);
const form = reactive({ apiKey: '' });
const { isFormValid, getFieldErrorMessage } = useFormValidation(
  { form },
  {
    form: {
      apiKey: {
        required,
      },
    },
  },
);

const submit = async () => {
  try {
    if (!isFormValid()) return;

    await lunchflowStore.connectAccount({ apiKey: form.apiKey });

    addNotification({
      text: 'Lunch Flow connected successfully!',
      type: NotificationType.success,
    });

    isDialogOpen.value = false;
    form.apiKey = '';
    emit('connected');
  } catch (e) {
    if (e instanceof Error && e.message.includes('Invalid API key')) {
      addNotification({
        text: 'Invalid API key. Please check your credentials.',
        type: NotificationType.error,
      });
      return;
    }

    addNotification({
      text: 'Unexpected error occurred',
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="isDialogOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title> Connect Lunch Flow </template>

    <form class="grid gap-6" @submit.prevent="submit">
      <p>
        Please visit your
        <a
          href="https://lunchflow.app/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary underline"
        >
          Lunch Flow dashboard
        </a>
        to create an API destination and get your API key.
      </p>

      <div>
        <InputField
          v-model="form.apiKey"
          name="apiKey"
          label="API Key"
          placeholder="your-lunchflow-api-key"
          :error-message="getFieldErrorMessage('form.apiKey')"
        />
      </div>

      <div class="flex">
        <Button type="submit" class="w-full" :disabled="lunchflowStore.isLoading"> Connect Account </Button>
      </div>
    </form>
  </ResponsiveDialog>
</template>
