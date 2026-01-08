<template>
  <div class="space-y-6">
    <!-- Info about extracted data -->
    <div v-if="store.extractionResult" class="bg-muted rounded-lg p-4">
      <div class="flex flex-wrap items-center gap-4 text-sm">
        <div>
          <span class="text-muted-foreground">Transactions:</span>
          <span class="ml-1 font-medium">{{ store.extractionResult.transactions.length }}</span>
        </div>
        <div v-if="store.extractionResult.metadata.bankName">
          <span class="text-muted-foreground">Bank:</span>
          <span class="ml-1 font-medium">{{ store.extractionResult.metadata.bankName }}</span>
        </div>
        <div v-if="store.detectedCurrency">
          <span class="text-muted-foreground">Currency:</span>
          <span class="ml-1 font-medium">{{ store.detectedCurrency }}</span>
        </div>
      </div>
    </div>

    <!-- Currency selector when not detected -->
    <div
      v-if="!store.detectedCurrency"
      class="flex flex-col gap-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4"
    >
      <div class="flex items-start gap-2 text-sm text-yellow-700">
        <AlertTriangleIcon class="mt-0.5 size-4 shrink-0" />
        <p>Could not detect statement currency. Please select the currency manually:</p>
      </div>
      <div class="max-w-xs">
        <Select.Select :model-value="store.manualCurrency ?? undefined" @update:model-value="handleCurrencyChange">
          <Select.SelectTrigger>
            <Select.SelectValue :placeholder="$t('pages.statementParser.selectCurrency')" />
          </Select.SelectTrigger>
          <Select.SelectContent>
            <template v-for="item of systemCurrenciesVerbose.linked" :key="item.code">
              <Select.SelectItem :value="item.code"> {{ item.code }} - {{ item.currency }} </Select.SelectItem>
            </template>
          </Select.SelectContent>
        </Select.Select>
      </div>
    </div>

    <!-- Account Selection -->
    <div class="space-y-4">
      <div class="xs:grid-cols-[minmax(0,1fr)_max-content] grid grid-cols-1 flex-wrap gap-3">
        <AccountSelectField
          :model-value="store.selectedAccount"
          :accounts="enabledAccounts"
          :detected-currency="store.effectiveCurrency"
          :is-new-account="store.isNewAccount"
          :placeholder="$t('pages.statementParser.selectExistingAccount')"
          @update:model-value="selectExistingAccount"
        />

        <Button variant="outline" @click="showCreateDialog = true">
          <PlusIcon class="mr-2 size-4" />
          Create New
        </Button>
      </div>

      <!-- Currency mismatch warning -->
      <div
        v-if="
          store.selectedAccount &&
          store.effectiveCurrency &&
          store.selectedAccount.currencyCode !== store.effectiveCurrency
        "
        class="flex items-start gap-2 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-700"
      >
        <AlertTriangleIcon class="mt-0.5 size-4 shrink-0" />
        <p>
          The statement currency ({{ store.effectiveCurrency }}) differs from the account currency ({{
            store.selectedAccount.currencyCode
          }}). Transactions will be imported using the account currency.
        </p>
      </div>

      <div class="flex gap-3">
        <Button variant="outline" @click="handleBack">
          <ArrowLeftIcon class="mr-2 size-4" />
          Back
        </Button>
        <Button v-if="store.selectedAccount" class="flex-1" @click="handleProceed">
          <template v-if="store.isNewAccount"> Import Transactions </template>
          <template v-else> Check for Duplicates </template>
        </Button>
      </div>
    </div>

    <!-- Create Account Dialog -->
    <CreateAccountForImportDialog
      v-model:open="showCreateDialog"
      :default-currency="store.effectiveCurrency"
      :default-name="store.extractionResult?.metadata.bankName"
      @created="handleAccountCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/lib/ui/button';
import * as Select from '@/components/lib/ui/select';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { useStatementParserStore } from '@/stores/statement-parser';
import type { AccountModel } from '@bt/shared/types';
import { AlertTriangleIcon, ArrowLeftIcon, PlusIcon } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { ref } from 'vue';

import AccountSelectField from './account-select-field.vue';
import CreateAccountForImportDialog from './create-account-for-import-dialog.vue';

const store = useStatementParserStore();
const accountsStore = useAccountsStore();
const currenciesStore = useCurrenciesStore();
const { enabledAccounts } = storeToRefs(accountsStore);
const { systemCurrenciesVerbose } = storeToRefs(currenciesStore);

const showCreateDialog = ref(false);

function selectExistingAccount(account: AccountModel | null) {
  if (account) {
    store.selectAccount({ account, isNew: false });
  } else {
    store.clearSelectedAccount();
  }
}

function handleAccountCreated(account: AccountModel) {
  store.selectAccount({ account, isNew: true });
  showCreateDialog.value = false;
}

function handleCurrencyChange(currencyCode: string | null) {
  store.setManualCurrency({ currencyCode });
  // Clear selected account when currency changes since it might no longer match
  store.clearSelectedAccount();
}

function handleBack() {
  store.goBackToStep({ step: 1 });
}

async function handleProceed() {
  await store.proceedFromAccountSelection();
}
</script>
