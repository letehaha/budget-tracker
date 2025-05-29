<script setup lang="ts">
import { createBudget } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import UiButton from '@/components/common/ui-button.vue';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
import { useNotificationCenter } from '@/components/notification-center';
import { ApiErrorResponseError } from '@/js/errors';
import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { computed, ref } from 'vue';

const BUDGET_DEFAULT_VALUES: {
  id: number | null;
  name: string | null;
  status: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  limitAmount?: number | null;
  autoInclude?: boolean;
} = {
  id: null,
  name: null,
  status: null,
  startDate: null,
  endDate: null,
  limitAmount: null,
  autoInclude: false,
} as const;

const emits = defineEmits(['create-budget']);
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();

const queryClient = useQueryClient();
const form = ref({ ...BUDGET_DEFAULT_VALUES });

const { isPending: isMutating, mutate: createBudgetItem } = useMutation({
  mutationFn: createBudget,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
    emits('create-budget');
    addSuccessNotification('Budget created');
  },
  onError(error) {
    if (error instanceof ApiErrorResponseError) {
      addErrorNotification(error.data.message);
    } else {
      addErrorNotification('Unexpected error!');
    }
  },
});

const isDateExist = computed(() => !!form.value.startDate && !!form.value.endDate);
const isSubmitDisabled = computed(() => isMutating.value || !form.value.name);
</script>

<template>
  <form class="grid gap-4" @submit.prevent="() => createBudgetItem(form)">
    <InputField v-model="form.name" label="Budget name" placeholder="Enter the name" />
    <div class="flex justify-between gap-4">
      <DateField
        v-model="form.startDate"
        :calendar-options="{
          maxDate: form.endDate,
        }"
        label="From date"
      />
      <DateField
        v-model="form.endDate"
        :calendar-options="{
          minDate: form.startDate,
        }"
        label="To date"
      />
    </div>

    <div class="flex gap-2">
      <label class="flex cursor-pointer items-center gap-2">
        <Checkbox :checked="form.autoInclude" :disabled="!isDateExist" @update:checked="form.autoInclude = $event" />
        Auto include transactions
      </label>
    </div>

    <div>
      <InputField v-model.number="form.limitAmount" label="Budget limit" placeholder="Enter the limit" />
    </div>

    <div class="mt-4">
      <UiButton :disabled="isSubmitDisabled" type="submit">Add budget</UiButton>
    </div>
  </form>
</template>
