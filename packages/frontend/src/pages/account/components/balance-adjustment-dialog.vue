<script setup lang="ts">
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import { InputField } from '@/components/fields';
import { Button } from '@/components/lib/ui/button';
import { useNotificationCenter } from '@/components/notification-center';
import { useFormValidation } from '@/composable';
import { useAdjustAccountBalance } from '@/composable/data-queries/accounts';
import { toLocalNumber } from '@/js/helpers';
import * as validators from '@/js/helpers/validators';
import { cn } from '@/lib/utils';
import { useCurrenciesStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ account: AccountModel }>();
const emit = defineEmits<{ close: [] }>();

const { currenciesMap } = storeToRefs(useCurrenciesStore());
const { mutateAsync: adjustBalance, isPending } = useAdjustAccountBalance();
const { addSuccessNotification, addErrorNotification } = useNotificationCenter();
const { t } = useI18n();

const isOpen = ref(true);
const mode = ref<'set-to' | 'adjust-by'>('set-to');
const form = ref({ amount: null as number | null, note: '' });
const direction = ref<'income' | 'expense'>('income');

const rules = computed(() => ({
  form: {
    amount: {
      required: validators.required,
      currencyDecimal: validators.currencyDecimal,
      ...(mode.value === 'adjust-by' ? { minValue: validators.minValue(0) } : {}),
    },
    note: {},
  },
}));

const { isFormValid, getFieldErrorMessage, touchField, resetValidation } = useFormValidation(
  { form },
  rules,
  undefined,
  {
    customValidationMessages: {
      currencyDecimal: t('forms.validators.invalidCurrencyDecimal'),
      minValue: t('forms.validators.mustBePositive'),
    },
  },
);

const currencyCode = computed(
  () => currenciesMap.value[props.account.currencyCode]?.currency.code ?? props.account.currencyCode,
);

const computedTarget = computed<number | null>(() => {
  if (form.value.amount === null) return null;
  if (mode.value === 'set-to') return form.value.amount;
  const sign = direction.value === 'income' ? 1 : -1;
  return props.account.currentBalance + sign * form.value.amount;
});

const diff = computed<number | null>(() =>
  computedTarget.value !== null ? computedTarget.value - props.account.currentBalance : null,
);

const previewType = computed<'income' | 'expense' | null>(() => {
  if (diff.value === null || diff.value === 0) return null;
  return diff.value > 0 ? 'income' : 'expense';
});

const isValid = computed(() => diff.value !== null && diff.value !== 0);

const submit = async () => {
  if (!isFormValid('form') || !isValid.value || computedTarget.value === null) return;

  try {
    await adjustBalance({
      id: props.account.id,
      targetBalance: computedTarget.value,
      note: form.value.note || undefined,
    });
    addSuccessNotification(t('pages.account.balanceAdjustmentDialog.successNotification'));
    isOpen.value = false;
  } catch {
    addErrorNotification(t('pages.account.balanceAdjustmentDialog.errorNotification'));
  }
};

watch(isOpen, (val) => {
  if (!val) emit('close');
});

// Reset form + validation when switching modes
watch(mode, () => {
  form.value.amount = null;
  form.value.note = '';
  resetValidation();
});
</script>

<template>
  <ResponsiveDialog v-model:open="isOpen">
    <template #title>{{ t('pages.account.balanceAdjustmentDialog.title') }}</template>

    <div class="grid gap-4 py-2">
      <!-- Mode toggle — styled tabs -->
      <div class="border-border bg-muted/20 flex gap-1 rounded-lg border p-1">
        <button
          type="button"
          :class="
            cn(
              'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              mode === 'set-to'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )
          "
          @click="mode = 'set-to'"
        >
          {{ t('pages.account.balanceAdjustmentDialog.setToBalance') }}
        </button>
        <button
          type="button"
          :class="
            cn(
              'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              mode === 'adjust-by'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )
          "
          @click="mode = 'adjust-by'"
        >
          {{ t('pages.account.balanceAdjustmentDialog.adjustByAmount') }}
        </button>
      </div>

      <!-- Amount input -->
      <InputField
        v-model="form.amount"
        type="number"
        :label="
          mode === 'set-to'
            ? t('pages.account.balanceAdjustmentDialog.newBalance')
            : t('pages.account.balanceAdjustmentDialog.amount')
        "
        :placeholder="
          mode === 'set-to'
            ? t('pages.account.balanceAdjustmentDialog.enterTargetBalance')
            : t('pages.account.balanceAdjustmentDialog.enterAmount')
        "
        :only-positive="mode === 'adjust-by'"
        :error-message="getFieldErrorMessage('form.amount')"
        @blur="touchField('form.amount')"
      >
        <template #iconTrailing>
          <span class="text-muted-foreground text-sm">{{ currencyCode }}</span>
        </template>
      </InputField>

      <!-- Direction toggle — Income/Expense with color coding -->
      <div v-if="mode === 'adjust-by'" class="flex gap-1.5">
        <button
          type="button"
          :class="
            cn(
              'h-9 flex-1 cursor-pointer rounded-md px-3 text-sm font-medium transition-all',
              direction === 'income'
                ? 'bg-green-500/15 text-green-600 ring-1 ring-green-500/30 dark:text-green-400'
                : 'text-muted-foreground hover:bg-green-500/10 hover:text-green-600 dark:hover:text-green-400',
            )
          "
          @click="direction = 'income'"
        >
          {{ t('pages.account.balanceAdjustmentDialog.income') }}
        </button>
        <button
          type="button"
          :class="
            cn(
              'h-9 flex-1 cursor-pointer rounded-md px-3 text-sm font-medium transition-all',
              direction === 'expense'
                ? 'bg-red-500/15 text-red-600 ring-1 ring-red-500/30 dark:text-red-400'
                : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400',
            )
          "
          @click="direction = 'expense'"
        >
          {{ t('pages.account.balanceAdjustmentDialog.expense') }}
        </button>
      </div>

      <!-- Live preview panel — fixed min-height to prevent layout shift -->
      <div class="border-border bg-muted/20 flex min-h-[calc(2lh+2rem)] flex-col justify-center rounded-lg border p-4">
        <template v-if="diff === null">
          <p class="text-muted-foreground text-sm">{{ t('pages.account.balanceAdjustmentDialog.enterAmountAbove') }}</p>
        </template>
        <template v-else-if="diff === 0">
          <p class="text-muted-foreground text-sm">
            {{ t('pages.account.balanceAdjustmentDialog.noAdjustmentNeeded') }}
          </p>
        </template>
        <template v-else>
          <p class="text-muted-foreground mb-1 text-sm">
            {{ toLocalNumber(account.currentBalance) }} {{ currencyCode }}
            →
            <span class="text-foreground font-medium">{{ toLocalNumber(computedTarget!) }} {{ currencyCode }}</span>
          </p>
          <p
            class="text-sm font-medium"
            :class="previewType === 'income' ? 'text-app-income-color' : 'text-app-expense-color'"
          >
            {{
              previewType === 'income'
                ? t('pages.account.balanceAdjustmentDialog.incomeWillBeCreated', {
                    amount: toLocalNumber(Math.abs(diff)),
                    currency: currencyCode,
                  })
                : t('pages.account.balanceAdjustmentDialog.expenseWillBeCreated', {
                    amount: toLocalNumber(Math.abs(diff)),
                    currency: currencyCode,
                  })
            }}
          </p>
        </template>
      </div>

      <InputField
        v-model="form.note"
        :label="t('pages.account.balanceAdjustmentDialog.transactionNote')"
        :placeholder="t('pages.account.balanceAdjustmentDialog.optionalNote')"
      />
    </div>

    <template #footer="{ close }">
      <Button variant="outline" @click="close">{{ t('pages.account.balanceAdjustmentDialog.cancel') }}</Button>
      <Button :disabled="!isValid || isPending" @click="submit">
        {{
          isPending
            ? t('pages.account.balanceAdjustmentDialog.saving')
            : t('pages.account.balanceAdjustmentDialog.confirm')
        }}
      </Button>
    </template>
  </ResponsiveDialog>
</template>
