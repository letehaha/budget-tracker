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

// The loan IS an Accounts row, cached in the store after the loan list query. Renders nothing while
// hydrating — the dialog needs an account model to open anyway.
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
