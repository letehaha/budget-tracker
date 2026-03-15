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
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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

const portfolioTypeLabels: Record<PORTFOLIO_TYPE, string> = {
  [PORTFOLIO_TYPE.investment]: 'dialogs.createPortfolio.form.portfolioTypes.investment',
  [PORTFOLIO_TYPE.retirement]: 'dialogs.createPortfolio.form.portfolioTypes.retirement',
  [PORTFOLIO_TYPE.savings]: 'dialogs.createPortfolio.form.portfolioTypes.savings',
  [PORTFOLIO_TYPE.other]: 'dialogs.createPortfolio.form.portfolioTypes.other',
};

const form = reactive({
  name: '',
  portfolioType: PORTFOLIO_TYPE.investment as PORTFOLIO_TYPE,
  description: '',
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
      text: t('forms.portfolioSettings.notifications.success'),
      type: NotificationType.success,
    });

    emit('updated', updated);
  } catch {
    addNotification({
      text: t('forms.portfolioSettings.notifications.error'),
      type: NotificationType.error,
    });
  }
};
</script>

<template>
  <form class="grid w-full max-w-[600px] gap-6" @submit.prevent="onSubmit">
    <InputField
      v-model="form.name"
      :label="$t('forms.portfolioSettings.nameLabel')"
      :placeholder="$t('forms.portfolioSettings.namePlaceholder')"
      :disabled="updateMutation.isPending.value || disabled"
      :error="!form.name.trim() && $t('forms.portfolioSettings.nameRequired')"
    />

    <div>
      <FieldLabel :label="$t('forms.portfolioSettings.typeLabel')">
        <Select.Select v-model="form.portfolioType" :disabled="updateMutation.isPending.value || disabled">
          <Select.SelectTrigger>
            <Select.SelectValue :placeholder="$t('forms.portfolioSettings.typePlaceholder')" />
          </Select.SelectTrigger>
          <Select.SelectContent>
            <Select.SelectItem v-for="t in Object.values(PORTFOLIO_TYPE)" :key="t" :value="t">
              {{ $t(portfolioTypeLabels[t]) }}
            </Select.SelectItem>
          </Select.SelectContent>
        </Select.Select>
      </FieldLabel>
    </div>

    <TextareaField
      v-model="form.description"
      :label="$t('forms.portfolioSettings.descriptionLabel')"
      :placeholder="$t('forms.portfolioSettings.descriptionPlaceholder')"
      :disabled="updateMutation.isPending.value || disabled"
    />

    <div class="flex justify-end gap-4">
      <UiButton
        type="button"
        variant="secondary"
        @click="emit('cancel')"
        :disabled="updateMutation.isPending.value || disabled"
      >
        {{ $t('forms.portfolioSettings.cancelButton') }}
      </UiButton>
      <UiButton type="submit" class="min-w-[120px]" :disabled="isSubmitDisabled">
        {{
          updateMutation.isPending.value
            ? $t('forms.portfolioSettings.submitButtonLoading')
            : $t('forms.portfolioSettings.submitButton')
        }}
      </UiButton>
    </div>
  </form>
</template>
