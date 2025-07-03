<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import FieldLabel from '@/components/fields/components/field-label.vue';
import InputField from '@/components/fields/input-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Select from '@/components/lib/ui/select';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useCreatePortfolio } from '@/composable/data-queries/portfolios';
import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { CheckIcon } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';

const { addNotification } = useNotificationCenter();

const isOpen = ref(false);

const form = reactive({
  name: '',
  portfolioType: PORTFOLIO_TYPE.investment,
  description: '',
});

// Portfolio type options for the select dropdown
const portfolioTypeOptions = [
  { value: PORTFOLIO_TYPE.investment, label: 'Investment' },
  { value: PORTFOLIO_TYPE.retirement, label: 'Retirement' },
  { value: PORTFOLIO_TYPE.savings, label: 'Savings' },
  { value: PORTFOLIO_TYPE.other, label: 'Other' },
];

const createPortfolioMutation = useCreatePortfolio();

const isSubmitDisabled = computed(() => createPortfolioMutation.isPending.value || !form.name.trim());

const resetForm = () => {
  form.name = '';
  form.portfolioType = PORTFOLIO_TYPE.investment;
  form.description = '';
};

const onPortfolioCreation = () => {
  isOpen.value = false;
  resetForm();
};

const createPortfolio = async () => {
  try {
    await createPortfolioMutation.mutateAsync({
      name: form.name.trim(),
      portfolioType: form.portfolioType,
      description: form.description.trim() || undefined,
      isEnabled: true,
    });

    addNotification({
      text: 'Portfolio created successfully.',
      type: NotificationType.success,
    });

    onPortfolioCreation();
  } catch {
    addNotification({
      text: 'Failed to create portfolio. Please try again.',
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #trigger>
      <slot />
    </template>

    <template #title>Create Portfolio</template>

    <template #description> Create a new investment portfolio to track your holdings and transactions. </template>

    <form class="mt-4 grid gap-6" @submit.prevent="createPortfolio">
      <InputField
        v-model="form.name"
        label="Portfolio name"
        placeholder="My Investment Portfolio"
        :disabled="createPortfolioMutation.isPending.value"
      />

      <div>
        <FieldLabel label="Portfolio Type">
          <Select.Select v-model="form.portfolioType" :disabled="createPortfolioMutation.isPending.value">
            <Select.SelectTrigger>
              <Select.SelectValue placeholder="Select portfolio type" />
            </Select.SelectTrigger>
            <Select.SelectContent>
              <Select.SelectItem v-for="option in portfolioTypeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </Select.SelectItem>
            </Select.SelectContent>
          </Select.Select>
        </FieldLabel>
      </div>

      <TextareaField
        v-model="form.description"
        label="Description (optional)"
        placeholder="A brief description of this portfolio..."
        :disabled="createPortfolioMutation.isPending.value"
      />

      <div class="flex">
        <UiButton type="submit" class="ml-auto min-w-[120px]" :disabled="isSubmitDisabled">
          <CheckIcon class="size-4" />
          {{ createPortfolioMutation.isPending.value ? 'Creating...' : 'Create Portfolio' }}
        </UiButton>
      </div>
    </form>
  </ResponsiveDialog>
</template>
