<script setup lang="ts">
import CategoryMultiSelectField from '@/components/fields/category-multi-select-field.vue';
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import type { BudgetModel } from '@bt/shared/types';
import { format } from 'date-fns';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  budget: BudgetModel;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  save: [payload: { name: string; limitAmount: number; categoryIds: number[] }];
}>();

const { t } = useI18n();

const formData = ref({
  name: '',
  limitAmount: 0,
  categoryIds: [] as number[],
  startDate: null as Date | null,
  endDate: null as Date | null,
});

// Initialize form data from budget prop on mount
const initFormData = () => {
  formData.value = {
    name: props.budget.name,
    limitAmount: props.budget.limitAmount,
    categoryIds: props.budget.categories?.map((c) => c.id) ?? [],
    startDate: props.budget.startDate,
    endDate: props.budget.endDate,
  };
};

// Reset form when budget changes (e.g., after successful save)
watch(
  () => props.budget,
  () => {
    initFormData();
  },
  { immediate: true },
);

const formatDate = (date: Date | null) => {
  if (!date) return null;
  return format(date, 'MMM d, yyyy');
};

const handleSave = () => {
  emit('save', {
    name: formData.value.name,
    limitAmount: formData.value.limitAmount,
    categoryIds: formData.value.categoryIds,
  });
};
</script>

<template>
  <div class="grid gap-4">
    <InputField
      v-model="formData.name"
      :label="t('budgets.settings.nameLabel')"
      :placeholder="t('budgets.settings.namePlaceholder')"
      class="w-full"
      :disabled="isLoading"
    />
    <InputField
      v-model="formData.limitAmount"
      :label="t('budgets.settings.limitLabel')"
      :placeholder="t('budgets.settings.limitPlaceholder')"
      type="number"
      class="w-full"
      :disabled="isLoading"
    />
    <CategoryMultiSelectField
      v-model="formData.categoryIds"
      :label="t('budgets.categoryBudget.settings.categoriesLabel')"
      :disabled="isLoading"
    />
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="text-muted-foreground mb-1.5 block text-sm font-medium">
          {{ t('budgets.settings.startDateLabel') }}
        </label>
        <div
          class="border-input bg-muted/50 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm"
        >
          {{ formatDate(formData.startDate) || 'Not set' }}
        </div>
      </div>
      <div>
        <label class="text-muted-foreground mb-1.5 block text-sm font-medium">
          {{ t('budgets.settings.endDateLabel') }}
        </label>
        <div
          class="border-input bg-muted/50 text-muted-foreground flex h-10 items-center rounded-md border px-3 text-sm"
        >
          {{ formatDate(formData.endDate) || 'Not set' }}
        </div>
      </div>
    </div>
    <div class="flex justify-end">
      <Button @click="handleSave" :disabled="isLoading">
        <template v-if="isLoading">Saving...</template>
        <template v-else>Save Changes</template>
      </Button>
    </div>
  </div>
</template>
