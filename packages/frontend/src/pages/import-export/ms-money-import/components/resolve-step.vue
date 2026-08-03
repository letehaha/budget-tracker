<script setup lang="ts">
/**
 * Microsoft Money resolve step — reconciles every account and category found in
 * the file against the user's existing app data using the shared mapping tables.
 *
 * Accounts have three outcomes here: create a new account, link to an existing
 * one, or skip the account entirely (its rows never reach the import). Each
 * `create-new` row also exposes an optional "current balance" input; leaving it
 * blank lets the imported transactions' sum drive the final balance.
 */
import InputField from '@/components/fields/input-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { captureException } from '@/lib/sentry';
import RecalculateBalanceToggle from '@/pages/import-export/components/recalculate-balance-toggle.vue';
import AccountMappingTable from '@/pages/import-export/components/resolve-values-step/account-mapping-table.vue';
import CategoryMappingTable from '@/pages/import-export/components/resolve-values-step/category-mapping-table.vue';
import { type QuickAction } from '@/pages/import-export/components/resolve-values-step/quick-action-toolbar.vue';
import { useAccountsStore } from '@/stores/accounts';
import { useCategoriesStore } from '@/stores/categories/categories';
import { useImportMsMoneyStore } from '@/stores/import-ms-money';
import { ChevronLeftIcon, ChevronRightIcon, LinkIcon, PlusIcon, RefreshCwIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const store = useImportMsMoneyStore();
const accountsStore = useAccountsStore();
const categoriesStore = useCategoriesStore();

const { importLinkableAccounts } = storeToRefs(accountsStore);
const { formattedCategories } = storeToRefs(categoriesStore);

// ---- Table items ----

/** Source accounts mapped to the shared table's item shape. */
const accountItems = computed(() =>
  (store.parsedResult?.accounts ?? []).map((account) => ({
    name: account.originalName,
    currency: account.currency,
    transactionCount: account.transactionCount,
  })),
);

/**
 * Source categories for the table, keyed by Money's full path (`"Auto:Gas"`) —
 * the same key the wire mapping uses.
 */
const categoryItems = computed(() => {
  const countByName = new Map<string, number>();
  for (const category of store.parsedResult?.categories ?? []) {
    countByName.set(category.fullName, category.transactionCount);
  }
  return store.resolvableCategoryNames.map((name) => ({ name, transactionCount: countByName.get(name) }));
});

// ---- Current-balance input bridge ----

/** Stored decimal balance for a create-new account, or null when unset. */
function balanceInputValue({ name }: { name: string }): number | null {
  const mapping = store.accountMapping[name];
  if (mapping?.action !== 'create-new') return null;
  return mapping.currentBalance;
}

/**
 * Number InputField emits `number | null` (null = cleared). Pass it straight
 * through: null leaves the balance equal to the sum of imported transactions.
 */
function onBalanceInput({ name, value }: { name: string; value: string | number | null }): void {
  store.setAccountCurrentBalance({ name, currentBalance: typeof value === 'number' ? value : null });
}

// ---- Quick-action toolbars ----

const accountQuickActions = computed<QuickAction[]>(() => [
  {
    icon: LinkIcon,
    label: t('pages.importExport.msMoneyImport.resolve.quickActions.mapExactMatches'),
    tooltip: t('pages.importExport.msMoneyImport.resolve.quickActions.tooltips.mapExactMatchesAccounts'),
    onClick: () => store.quickMapExactMatches({ entity: 'accounts' }),
  },
  {
    icon: PlusIcon,
    label: t('pages.importExport.msMoneyImport.resolve.quickActions.createNewForUnmatched'),
    tooltip: t('pages.importExport.msMoneyImport.resolve.quickActions.tooltips.createNewForUnmatched'),
    onClick: () => store.quickCreateNewForUnmatched({ entity: 'accounts' }),
  },
  {
    icon: RefreshCwIcon,
    label: t('pages.importExport.msMoneyImport.resolve.quickActions.reset'),
    tooltip: t('pages.importExport.msMoneyImport.resolve.quickActions.tooltips.reset'),
    onClick: () => store.resetResolveEntity({ entity: 'accounts' }),
  },
]);

const categoryQuickActions = computed<QuickAction[]>(() => [
  {
    icon: LinkIcon,
    label: t('pages.importExport.msMoneyImport.resolve.quickActions.mapExactMatches'),
    tooltip: t('pages.importExport.msMoneyImport.resolve.quickActions.tooltips.mapExactMatchesCategories'),
    onClick: () => store.quickMapExactMatches({ entity: 'categories' }),
  },
  {
    icon: PlusIcon,
    label: t('pages.importExport.msMoneyImport.resolve.quickActions.createNewForUnmatched'),
    tooltip: t('pages.importExport.msMoneyImport.resolve.quickActions.tooltips.createNewForUnmatched'),
    onClick: () => store.quickCreateNewForUnmatched({ entity: 'categories' }),
  },
  {
    icon: RefreshCwIcon,
    label: t('pages.importExport.msMoneyImport.resolve.quickActions.reset'),
    tooltip: t('pages.importExport.msMoneyImport.resolve.quickActions.tooltips.reset'),
    onClick: () => store.resetResolveEntity({ entity: 'categories' }),
  },
]);

// ---- Mount: ensure link targets are loaded + auto-match ----

/** Set when auto-matching threw, so the step says why every row is unresolved. */
const prepareError = ref('');

onMounted(() => {
  store.prepareResolveStep().catch((error) => {
    captureException({ error, context: { scope: 'import-ms-money:prepare-resolve-step' } });
    prepareError.value = t('pages.importExport.msMoneyImport.resolve.prepareFailed');
  });
});

// ---- Footer nav ----

const isNavigating = ref(false);

async function handleContinue() {
  isNavigating.value = true;
  try {
    await store.detectDuplicates();
  } catch {
    // Error captured in store.detectError and shown via Callout.
  } finally {
    isNavigating.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <Callout v-if="prepareError" variant="destructive" role="alert">
      <p>{{ prepareError }}</p>
    </Callout>

    <!-- ==================== ACCOUNTS SECTION ==================== -->
    <AccountMappingTable
      :items="accountItems"
      :mapping="store.accountMapping"
      :available-accounts="importLinkableAccounts"
      :title="$t('pages.importExport.msMoneyImport.resolve.accounts.sectionTitle')"
      :resolved-label="$t('importShared.resolvedCounterWord')"
      :quick-actions="accountQuickActions"
      allow-skip
      @set-action="store.setAccountAction"
      @set-target="store.setAccountTarget"
    >
      <!-- Optional current balance for create-new accounts. -->
      <template #create-new-cell="{ item }">
        <div class="flex flex-col gap-1">
          <InputField
            type="number"
            :model-value="balanceInputValue({ name: item.name })"
            :label="$t('pages.importExport.msMoneyImport.resolve.accounts.currentBalanceLabel')"
            :placeholder="$t('pages.importExport.msMoneyImport.resolve.accounts.currentBalancePlaceholder')"
            @update:model-value="(value) => onBalanceInput({ name: item.name, value })"
          />
          <span class="text-muted-foreground text-xs">
            {{
              $t('pages.importExport.msMoneyImport.resolve.accounts.willCreateHint', {
                currency: item.currency || '—',
              })
            }}
          </span>
        </div>
      </template>
    </AccountMappingTable>

    <!-- Skipping an account also drops its transfers, which is not obvious from
         the row itself — spell it out once the user has skipped something. -->
    <Callout v-if="store.skippedAccountNames.length > 0" variant="warning">
      <p>
        {{
          $t('pages.importExport.msMoneyImport.resolve.accounts.skippedNote', {
            count: store.skippedAccountNames.length,
          })
        }}
      </p>
    </Callout>

    <!-- ==================== CATEGORIES SECTION ==================== -->
    <CategoryMappingTable
      :items="categoryItems"
      :mapping="store.categoryMapping"
      :available-categories="formattedCategories"
      :title="$t('pages.importExport.msMoneyImport.resolve.categories.sectionTitle')"
      :resolved-label="$t('importShared.resolvedCounterWord')"
      :quick-actions="categoryQuickActions"
      @set-action="store.setCategoryAction"
      @set-target="store.setCategoryTarget"
    />

    <!-- ==================== BALANCE RECALCULATION ==================== -->
    <RecalculateBalanceToggle
      v-model="store.recalculateBalance"
      :settings-loading="store.recalculateBalanceSettingLoading"
      :settings-load-failed="store.recalculateBalanceSettingLoadFailed"
    />

    <!-- Detect error from store (e.g. network failure during detectDuplicates) -->
    <Callout v-if="store.detectError" variant="destructive" role="alert">
      <p>{{ store.detectError }}</p>
    </Callout>

    <!-- ==================== FOOTER ==================== -->
    <div class="flex items-center justify-between pt-2">
      <UiButton variant="ghost" @click="store.goBack()">
        <ChevronLeftIcon class="size-4" />
        {{ $t('pages.importExport.msMoneyImport.resolve.footer.back') }}
      </UiButton>

      <UiButton
        :disabled="!store.isResolveStepValid || isNavigating || store.isDetectingDuplicates"
        @click="handleContinue"
      >
        {{ $t('pages.importExport.msMoneyImport.resolve.footer.continue') }}
        <ChevronRightIcon class="size-4" />
      </UiButton>
    </div>
  </div>
</template>
