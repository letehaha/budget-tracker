<script setup lang="ts">
import { type LoanApi } from '@/api/loans';
import { Button } from '@/components/lib/ui/button';
import { useAccountsStore } from '@/stores';
import { PlusIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

import LoanPaymentDialog from './loan-payment-dialog/index.vue';

const props = defineProps<{ loan: LoanApi }>();

const accountsStore = useAccountsStore();
const { accountsRecord } = storeToRefs(accountsStore);

// The loan IS an Accounts row; the store has it cached after the loan list
// query. While the store is hydrating we render nothing — the dialog can't
// open without an account model anyway, and the button is a visual nicety.
const loanAccount = computed(() => accountsRecord.value[props.loan.id]);

const isOpen = ref(false);
</script>

<template>
  <LoanPaymentDialog v-if="loanAccount" v-model:open="isOpen" :loan-account="loanAccount">
    <Button variant="outline" size="sm">
      <PlusIcon class="size-4" />
      {{ $t('loans.detail.recordPayment') }}
    </Button>
  </LoanPaymentDialog>
</template>
