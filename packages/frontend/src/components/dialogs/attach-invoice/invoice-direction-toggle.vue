<script setup lang="ts">
import TransactionTypeToggle from '@/components/fields/transaction-type-toggle.vue';
import { TRANSACTION_TYPES } from '@bt/shared/types';

const model = defineModel<TRANSACTION_TYPES>({ required: true });

defineProps<{ disabled?: boolean }>();
</script>

<template>
  <div class="grid gap-2">
    <TransactionTypeToggle
      v-model="model"
      :expense-label="$t('dialogs.attachInvoice.direction.paid')"
      :income-label="$t('dialogs.attachInvoice.direction.gotPaid')"
      :disabled="disabled"
    />
    <p class="text-muted-foreground text-xs">
      {{
        model === TRANSACTION_TYPES.income
          ? $t('dialogs.attachInvoice.direction.gotPaidHint')
          : $t('dialogs.attachInvoice.direction.paidHint')
      }}
    </p>
  </div>
</template>
