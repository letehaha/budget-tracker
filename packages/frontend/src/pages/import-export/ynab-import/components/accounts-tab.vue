<template>
  <div class="space-y-3">
    <p class="text-muted-foreground text-sm">
      {{ $t('pages.importExport.ynabImport.preview.accountsHelper') }}
    </p>

    <Callout v-if="store.skippedAccountNames.length > 0" variant="warning">
      <p>
        {{
          $t('pages.importExport.ynabImport.preview.skippedNote', {
            count: store.skippedAccountNames.length,
          })
        }}
      </p>
    </Callout>

    <EmptyList v-if="accounts.length === 0" />
    <VirtualList
      v-else
      :items="accounts"
      container-class="h-[480px]"
      :estimate-size="124"
      :overscan="4"
      :get-item-key="(acc) => acc.originalName"
    >
      <template #default="{ item: acc }">
        <div class="pb-3">
          <AccountPickRow
            :account="acc"
            :mapping="store.accountPicks[acc.originalName]"
            :currency-options="currencyOptions"
            @update="(mapping) => (store.accountPicks[acc.originalName] = mapping)"
            @toggle-skip="store.toggleAccountSkip({ accountName: acc.originalName })"
          />
        </div>
      </template>
    </VirtualList>
  </div>
</template>

<script setup lang="ts">
import { Callout } from '@/components/lib/ui/callout';
import { useImportYnabStore } from '@/stores/import-ynab';
import type { YnabParseAccount } from '@bt/shared/types';

import AccountPickRow from './account-pick-row.vue';
import EmptyList from './empty-list.vue';
import type { CurrencyOption } from './preview-step.vue';
import VirtualList from './virtual-list.vue';

defineProps<{
  accounts: YnabParseAccount[];
  currencyOptions: CurrencyOption[];
}>();

const store = useImportYnabStore();
</script>
