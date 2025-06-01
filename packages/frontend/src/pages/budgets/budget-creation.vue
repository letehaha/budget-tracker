<script setup lang="ts">
import { createBudget } from '@/api/budgets';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import DateField from '@/components/fields/date-field.vue';
import InputField from '@/components/fields/input-field.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import Checkbox from '@/components/lib/ui/checkbox/Checkbox.vue';
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
  limitAmount: 0,
  autoInclude: false,
} as const;

const emits = defineEmits(['create-budget']);

const queryClient = useQueryClient();
const form = ref({ ...BUDGET_DEFAULT_VALUES });

const { isPending: isMutating, mutate } = useMutation({
  mutationFn: createBudget,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: VUE_QUERY_CACHE_KEYS.budgetsList });
  },
});

const isDateExist = computed(() => !!form.value.startDate && !!form.value.endDate);
const isSubmitDisabled = computed(() => isMutating.value || !form.value.name || !form.value.limitAmount);

const createBudgetItem = async () => {
  await mutate(form.value);
  emits('create-budget');
};
</script>

<template>
  <form class="grid gap-4">
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
      <Button :disabled="isSubmitDisabled" @click="createBudgetItem">Add budget</Button>
    </div>
  </form>
</template>
