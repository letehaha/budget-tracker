<script setup lang="ts">
import FieldLabel from '@/components/fields/components/field-label.vue';
import InputField from '@/components/fields/input-field.vue';
import TextareaField from '@/components/fields/textarea-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import * as Select from '@/components/lib/ui/select';
import { NotificationType, useNotificationCenter } from '@/components/notification-center';
import { useUpdatePortfolio } from '@/composable/data-queries/portfolios';
import { PORTFOLIO_TYPE, PortfolioModel } from '@bt/shared/types/investments';
import { computed, reactive, watch } from 'vue';

interface Emit {
  (e: 'updated', portfolio: PortfolioModel): void;
  (e: 'cancel'): void;
}

const props = defineProps<{
  portfolio: PortfolioModel;
  /** Disable the form inputs */
  disabled?: boolean;
}>();

const emit = defineEmits<Emit>();

const { addNotification } = useNotificationCenter();

const form = reactive({
  name: '',
  portfolioType: PORTFOLIO_TYPE.investment as PORTFOLIO_TYPE,
  description: '' as string | null,
});

watch(
  () => props.portfolio,
  (p) => {
    if (p) {
      form.name = p.name;
      form.portfolioType = p.portfolioType;
      form.description = p.description ?? '';
    }
  },
  { immediate: true },
);

const updateMutation = useUpdatePortfolio();

const isSubmitDisabled = computed(
  () =>
    props.disabled ||
    updateMutation.isPending.value ||
    !form.name.trim() ||
    (form.name.trim() === props.portfolio.name &&
      form.portfolioType === props.portfolio.portfolioType &&
      (form.description ?? '') === (props.portfolio.description ?? '')),
);

const onSubmit = async () => {
  try {
    const updated = await updateMutation.mutateAsync({
      portfolioId: props.portfolio.id,
      name: form.name.trim(),
      portfolioType: form.portfolioType,
      description: form.description?.trim() || undefined,
    });

    addNotification({
      text: 'Portfolio updated successfully.',
      type: NotificationType.success,
    });

    emit('updated', updated);
  } catch {
    addNotification({
      text: 'Failed to update portfolio. Please try again.',
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <form class="grid w-full max-w-[600px] gap-6" @submit.prevent="onSubmit">
    <InputField
      v-model="form.name"
      label="Portfolio Name"
      placeholder="My Investment Portfolio"
      :disabled="updateMutation.isPending.value || disabled"
      :error="!form.name.trim() && 'Name is required'"
    />

    <div>
      <FieldLabel label="Portfolio Type">
        <Select.Select v-model="form.portfolioType" :disabled="updateMutation.isPending.value || disabled">
          <Select.SelectTrigger>
            <Select.SelectValue placeholder="Select portfolio type" />
          </Select.SelectTrigger>
          <Select.SelectContent>
            <Select.SelectItem v-for="t in Object.values(PORTFOLIO_TYPE)" :key="t" :value="t">
              {{ t.charAt(0).toUpperCase() + t.slice(1) }}
            </Select.SelectItem>
          </Select.SelectContent>
        </Select.Select>
      </FieldLabel>
    </div>

    <TextareaField
      v-model="form.description"
      label="Description (optional)"
      placeholder="A brief description of this portfolio..."
      :disabled="updateMutation.isPending.value || disabled"
    />

    <div class="flex justify-end gap-4">
      <UiButton
        type="button"
        variant="secondary"
        @click="emit('cancel')"
        :disabled="updateMutation.isPending.value || disabled"
      >
        Cancel
      </UiButton>
      <UiButton type="submit" class="min-w-[120px]" :disabled="isSubmitDisabled">
        {{ updateMutation.isPending.value ? 'Saving...' : 'Save Changes' }}
      </UiButton>
    </div>
  </form>
</template>
