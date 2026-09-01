<script setup lang="ts">
import { formatShortDate } from '@/common/utils/date';
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import RecalculateBalanceToggle from '@/pages/import-export/components/recalculate-balance-toggle.vue';
import AccountMappingTable from '@/pages/import-export/components/resolve-values-step/account-mapping-table.vue';
import type { QuickAction } from '@/pages/import-export/components/resolve-values-step/quick-action-toolbar.vue';
import { useAccountsStore } from '@/stores/accounts';
import { useImportOfxStore } from '@/stores/import-ofx';
import type { OfxParseAccount } from '@bt/shared/types';
import { ChevronLeftIcon, ChevronRightIcon, LinkIcon, PlusIcon, RefreshCwIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const store = useImportOfxStore();
const { importLinkableAccounts } = storeToRefs(useAccountsStore());
const isNavigating = ref(false);
const accountItems = computed(() =>
  (store.parsedResult?.accounts ?? []).map((account) => ({
    name: account.maskedDisplayName,
    mappingKey: account.sourceAccountKey,
    currency: account.currency,
    transactionCount: account.transactionCount,
    account,
  })),
);
const quickActions = computed<QuickAction[]>(() => [
  {
    icon: LinkIcon,
    label: t('pages.importExport.ofxImport.resolve.quickActions.mapExactMatches'),
    tooltip: t('pages.importExport.ofxImport.resolve.quickActions.tooltips.mapExactMatches'),
    onClick: store.quickMapExactMatches,
    menu: true,
  },
  {
    icon: PlusIcon,
    label: t('pages.importExport.ofxImport.resolve.quickActions.createNewForUnmatched'),
    tooltip: t('pages.importExport.ofxImport.resolve.quickActions.tooltips.createNewForUnmatched'),
    onClick: store.quickCreateNewForUnmatched,
    menu: true,
  },
  {
    icon: RefreshCwIcon,
    label: t('pages.importExport.ofxImport.resolve.quickActions.reset'),
    tooltip: t('pages.importExport.ofxImport.resolve.quickActions.tooltips.reset'),
    onClick: store.resetResolveAccounts,
  },
]);
function createValue({ key }: { key: string }) {
  const value = store.accountMapping[key];
  return value?.action === 'create-new' ? value : null;
}
function sourceKey({ item }: { item: { name: string; mappingKey?: string } }): string {
  return item.mappingKey ?? item.name;
}
function sourceAccount({ item }: { item: { name: string; mappingKey?: string } }): OfxParseAccount | undefined {
  const key = sourceKey({ item });
  return store.parsedResult?.accounts.find((account) => account.sourceAccountKey === key);
}
async function handleContinue() {
  isNavigating.value = true;
  try {
    await store.detectDuplicates();
  } catch {
  } finally {
    isNavigating.value = false;
  }
}
</script>
<template>
  <div class="flex flex-col gap-6">
    <AccountMappingTable
      :items="accountItems"
      :mapping="store.accountMapping"
      :available-accounts="importLinkableAccounts"
      :title="$t('pages.importExport.ofxImport.resolve.accounts.sectionTitle')"
      :resolved-label="$t('importShared.resolvedCounterWord')"
      :quick-actions="quickActions"
      allow-skip
      @set-action="store.setAccountAction"
      @set-target="store.setAccountTarget"
    >
      <template #create-new-cell="{ item }">
        <div class="grid gap-2">
          <InputField
            :model-value="createValue({ key: sourceKey({ item }) })?.name ?? ''"
            :label="$t('pages.importExport.ofxImport.resolve.accounts.nameLabel')"
            :placeholder="$t('pages.importExport.ofxImport.resolve.accounts.namePlaceholder')"
            @update:model-value="
              (name) => store.setAccountName({ sourceAccountKey: sourceKey({ item }), name: String(name ?? '') })
            "
          />
          <InputField
            type="number"
            :model-value="createValue({ key: sourceKey({ item }) })?.currentBalance ?? null"
            :label="$t('pages.importExport.ofxImport.resolve.accounts.currentBalanceLabel')"
            :placeholder="
              sourceAccount({ item })?.ledgerBalance == null
                ? $t('pages.importExport.ofxImport.resolve.accounts.currentBalancePlaceholder')
                : String(sourceAccount({ item })?.ledgerBalance)
            "
            @update:model-value="
              (value) =>
                store.setAccountCurrentBalance({
                  name: sourceKey({ item }),
                  currentBalance: typeof value === 'number' ? value : null,
                })
            "
          />
          <p v-if="sourceAccount({ item })?.ledgerBalance != null" class="text-muted-foreground text-xs">
            {{
              $t('pages.importExport.ofxImport.resolve.accounts.ledgerBalanceHint', {
                balance: sourceAccount({ item })?.ledgerBalance,
                date: sourceAccount({ item })?.ledgerBalanceDate
                  ? formatShortDate(sourceAccount({ item })!.ledgerBalanceDate!)
                  : '—',
              })
            }}
          </p>
        </div>
      </template>
    </AccountMappingTable>
    <div class="text-muted-foreground grid gap-1 text-xs">
      <p v-for="item in accountItems" :key="item.mappingKey">
        {{ item.name }} ·
        {{ $t(`pages.importExport.ofxImport.resolve.accounts.statementType.${item.account.statementType}`) }} ·
        {{ item.account.accountType }} ·
        {{
          $t(
            'pages.importExport.ofxImport.resolve.accounts.transactionCount',
            { count: item.transactionCount },
            item.transactionCount,
          )
        }}
      </p>
    </div>
    <Callout v-if="store.skippedAccountKeys.length" variant="warning">{{
      $t('pages.importExport.ofxImport.resolve.accounts.skippedNote', { count: store.skippedAccountKeys.length })
    }}</Callout>
    <RecalculateBalanceToggle
      v-model="store.recalculateBalance"
      :settings-loading="store.recalculateBalanceSettingLoading"
      :settings-load-failed="store.recalculateBalanceSettingLoadFailed"
    />
    <Callout v-if="store.detectError" variant="destructive" role="alert">{{ store.detectError }}</Callout>
    <div class="flex items-center justify-between pt-2">
      <UiButton variant="ghost" @click="store.goBack()"
        ><ChevronLeftIcon class="size-4" />{{ $t('pages.importExport.ofxImport.resolve.footer.back') }}</UiButton
      ><UiButton :disabled="!store.isResolveStepValid || isNavigating" @click="handleContinue"
        >{{ $t('pages.importExport.ofxImport.resolve.footer.continue') }}<ChevronRightIcon class="size-4"
      /></UiButton>
    </div>
  </div>
</template>
