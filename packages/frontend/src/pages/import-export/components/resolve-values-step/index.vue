<script setup lang="ts">
import InputField from '@/components/fields/input-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { MappingTable, type MappingTableColumn } from '@/components/lib/ui/mapping-table';
import { StatusIndicator } from '@/components/lib/ui/status-indicator';
import { cn } from '@/lib/utils';
import RecalculateBalanceToggle from '@/pages/import-export/components/recalculate-balance-toggle.vue';
import { useCategoriesStore } from '@/stores/categories/categories';
import { useImportExportStore } from '@/stores/import-export';
import { useTagsStore } from '@/stores/tags';
import { useAccountsStore } from '@/stores/accounts';
import type { TagMappingValue } from '@bt/shared/types';
import AccountMappingTable from './account-mapping-table.vue';
import CategoryMappingTable from './category-mapping-table.vue';
import QuickActionsToolbar, { type QuickAction } from './quick-action-toolbar.vue';
import { ChevronLeftIcon, ChevronRightIcon, RefreshCwIcon, LinkIcon, PlusIcon, SkipForwardIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// ---- Stores ----

const importStore = useImportExportStore();
const accountsStore = useAccountsStore();
const categoriesStore = useCategoriesStore();
const tagsStore = useTagsStore();

const { importLinkableAccounts } = storeToRefs(accountsStore);
const { formattedCategories } = storeToRefs(categoriesStore);
const { tags } = storeToRefs(tagsStore);

// ---- Option lists ----

interface OptionItem<V extends string = string> {
  label: string;
  value: V;
}

const tagActionOptions = computed<OptionItem<TagMappingValue['action']>[]>(() => [
  { label: t('pages.importExport.resolveValues.actions.createNew'), value: 'create-new' },
  { label: t('pages.importExport.resolveValues.actions.linkExisting'), value: 'link-existing' },
  { label: t('pages.importExport.resolveValues.actions.skip'), value: 'skip' },
]);

// ---- Account mapping (shared table) emit handlers ----

function onAccountSetAction({ name, action }: { name: string; action: 'create-new' | 'link-existing' }) {
  if (action === 'create-new') {
    // `currentBalance: null` = leave the created account at the imported rows'
    // net sum; the balance input below overwrites it when the user enters a value.
    importStore.accountMapping[name] = { action: 'create-new', currentBalance: null };
  } else {
    importStore.accountMapping[name] = { action: 'link-existing', accountId: '' };
  }
}

function onAccountSetTarget({ name, accountId }: { name: string; accountId: string }) {
  importStore.accountMapping[name] = { action: 'link-existing', accountId };
}

// ---- Current-balance input bridge (create-new accounts only) ----

/** Stored decimal current balance for a create-new account, or null when unset. */
function balanceInputValue(name: string): number | null {
  const mapping = importStore.accountMapping[name];
  if (mapping?.action !== 'create-new') return null;
  return mapping.currentBalance ?? null;
}

/**
 * Number InputField emits `number | null` (null = cleared). Pass it straight
 * through: null leaves the created account's balance equal to the sum of
 * imported transactions.
 */
function onBalanceInput({ name, value }: { name: string; value: string | number | null }): void {
  const mapping = importStore.accountMapping[name];
  if (mapping?.action !== 'create-new') return;
  mapping.currentBalance = typeof value === 'number' ? value : null;
}

// ---- Category mapping (shared table) emit handlers ----

function onCategorySetAction({ name, action }: { name: string; action: 'create-new' | 'link-existing' }) {
  if (action === 'create-new') {
    importStore.categoryMapping[name] = { action: 'create-new' };
  } else {
    importStore.categoryMapping[name] = { action: 'link-existing', categoryId: '' };
  }
}

function onCategorySetTarget({ name, categoryId }: { name: string; categoryId: string }) {
  importStore.categoryMapping[name] = { action: 'link-existing', categoryId };
}

// ---- Category items for the shared table (names → { name }) ----

const categoryItems = computed(() => importStore.uniqueCategoriesInCSV.map((name) => ({ name })));

// ---- Tags table (kept inlined — out of scope for the shared extraction) ----

type ResolveRowStatus = 'auto-matched' | 'will-create' | 'needs-attention' | 'skipped';

/**
 * Maps a row's chosen action to a visual status. `link-existing` is only
 * "auto-matched" once a concrete target is picked (hasTarget); without one it
 * still needs attention. Unset actions also need attention.
 */
function resolveRowStatus({ action, hasTarget }: { action: string | undefined; hasTarget: boolean }): ResolveRowStatus {
  if (!action) return 'needs-attention';
  if (action === 'link-existing') return hasTarget ? 'auto-matched' : 'needs-attention';
  if (action === 'create-new') return 'will-create';
  if (action === 'skip') return 'skipped';
  return 'needs-attention';
}

function getTagStatus(name: string): ResolveRowStatus {
  const m = importStore.tagMapping[name];
  return resolveRowStatus({ action: m?.action, hasTarget: m?.action === 'link-existing' && !!m.tagId });
}

const tagResolvedCount = computed(
  () => importStore.uniqueTagsInCSV.filter((tg) => getTagStatus(tg) !== 'needs-attention').length,
);

const tagColumns: MappingTableColumn[] = [
  { key: 'status', label: '', width: '36px', hideLabelInCard: true, cardHeader: true },
  { key: 'name', label: t('pages.importExport.resolveValues.tags.csvName'), width: 'minmax(0,1fr)', cardHeader: true },
  { key: 'action', label: t('pages.importExport.resolveValues.tags.action'), width: '160px', cardValue: 'control' },
  {
    key: 'target',
    label: t('pages.importExport.resolveValues.tags.target'),
    width: 'minmax(0,1fr)',
    cardValue: 'control',
  },
];

function getTagActionOption(name: string): OptionItem<TagMappingValue['action']> | null {
  const mapping = importStore.tagMapping[name];
  if (!mapping) return null;
  return tagActionOptions.value.find((o) => o.value === mapping.action) ?? null;
}

function handleTagAction({ name, option }: { name: string; option: OptionItem<TagMappingValue['action']> | null }) {
  if (!option) {
    delete importStore.tagMapping[name];
    return;
  }
  if (option.value === 'create-new') {
    importStore.tagMapping[name] = { action: 'create-new' };
  } else if (option.value === 'link-existing') {
    importStore.tagMapping[name] = { action: 'link-existing', tagId: '' };
  } else if (option.value === 'skip') {
    importStore.tagMapping[name] = { action: 'skip' };
  }
}

function getTagSelectOptions(): OptionItem[] {
  return tags.value.map((tg) => ({ label: tg.name, value: String(tg.id) }));
}

function getTagSelectValue(name: string): OptionItem | null {
  const mapping = importStore.tagMapping[name];
  if (mapping?.action !== 'link-existing' || !mapping.tagId) return null;
  const tg = tags.value.find((candidate) => String(candidate.id) === mapping.tagId);
  if (!tg) return null;
  return { label: tg.name, value: String(tg.id) };
}

function handleTagSelect({ name, option }: { name: string; option: OptionItem | null }) {
  if (option) {
    importStore.tagMapping[name] = { action: 'link-existing', tagId: option.value };
  } else {
    importStore.tagMapping[name] = { action: 'link-existing', tagId: '' };
  }
}

// ---- Quick-action toolbars (per entity type) ----

const accountQuickActions = computed<QuickAction[]>(() => [
  {
    icon: LinkIcon,
    label: t('pages.importExport.resolveValues.quickActions.mapExactMatches'),
    tooltip: t('pages.importExport.resolveValues.quickActions.tooltips.mapExactMatchesAccounts'),
    onClick: () => importStore.quickMapExactMatches({ entity: 'accounts' }),
  },
  {
    icon: PlusIcon,
    label: t('pages.importExport.resolveValues.quickActions.createNewForUnmatched'),
    tooltip: t('pages.importExport.resolveValues.quickActions.tooltips.createNewForUnmatched'),
    onClick: () => importStore.quickCreateNewForUnmatched({ entity: 'accounts' }),
  },
  {
    icon: RefreshCwIcon,
    label: t('pages.importExport.resolveValues.quickActions.reset'),
    tooltip: t('pages.importExport.resolveValues.quickActions.tooltips.reset'),
    onClick: () => importStore.resetResolveEntity({ entity: 'accounts' }),
  },
]);

const categoryQuickActions = computed<QuickAction[]>(() => [
  {
    icon: LinkIcon,
    label: t('pages.importExport.resolveValues.quickActions.mapExactMatches'),
    tooltip: t('pages.importExport.resolveValues.quickActions.tooltips.mapExactMatchesCategories'),
    onClick: () => importStore.quickMapExactMatches({ entity: 'categories' }),
  },
  {
    icon: PlusIcon,
    label: t('pages.importExport.resolveValues.quickActions.createNewForUnmatched'),
    tooltip: t('pages.importExport.resolveValues.quickActions.tooltips.createNewForUnmatched'),
    onClick: () => importStore.quickCreateNewForUnmatched({ entity: 'categories' }),
  },
  {
    icon: RefreshCwIcon,
    label: t('pages.importExport.resolveValues.quickActions.reset'),
    tooltip: t('pages.importExport.resolveValues.quickActions.tooltips.reset'),
    onClick: () => importStore.resetResolveEntity({ entity: 'categories' }),
  },
]);

const tagQuickActions = computed<QuickAction[]>(() => [
  {
    icon: LinkIcon,
    label: t('pages.importExport.resolveValues.quickActions.mapExactMatches'),
    tooltip: t('pages.importExport.resolveValues.quickActions.tooltips.mapExactMatchesTags'),
    onClick: () => importStore.quickMapExactMatches({ entity: 'tags' }),
  },
  {
    icon: PlusIcon,
    label: t('pages.importExport.resolveValues.quickActions.createNewForUnmatched'),
    tooltip: t('pages.importExport.resolveValues.quickActions.tooltips.createNewForUnmatched'),
    onClick: () => importStore.quickCreateNewForUnmatched({ entity: 'tags' }),
  },
  {
    icon: SkipForwardIcon,
    label: t('pages.importExport.resolveValues.quickActions.skipAll'),
    tooltip: t('pages.importExport.resolveValues.quickActions.tooltips.skipAll'),
    onClick: () => importStore.quickSkipAllTags(),
  },
  {
    icon: RefreshCwIcon,
    label: t('pages.importExport.resolveValues.quickActions.reset'),
    tooltip: t('pages.importExport.resolveValues.quickActions.tooltips.reset'),
    onClick: () => importStore.resetResolveEntity({ entity: 'tags' }),
  },
]);

// ---- Mount ----

onMounted(() => {
  importStore.prepareResolveStep();
});

// ---- Footer nav ----

const isNavigating = ref(false);
const navError = ref<string | null>(null);

async function handleNext() {
  isNavigating.value = true;
  navError.value = null;
  try {
    await importStore.detectDuplicates();
  } catch {
    navError.value = t('pages.importExport.resolveValues.detectError');
  } finally {
    isNavigating.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Loading skeleton while extracting -->
    <div v-if="importStore.isExtracting" class="space-y-4">
      <div class="bg-muted h-6 w-48 animate-pulse rounded" />
      <div class="bg-muted h-40 animate-pulse rounded-lg" />
    </div>

    <template v-else>
      <!-- Extraction error -->
      <Callout v-if="importStore.extractError" variant="destructive" role="alert">
        <p>{{ importStore.extractError }}</p>
        <UiButton variant="outline" size="sm" class="mt-3" @click="importStore.extractUniqueValues()">
          {{ t('pages.importExport.resolveValues.retry') }}
        </UiButton>
      </Callout>

      <!-- Currency mismatch warning -->
      <Callout v-if="importStore.currencyMismatchWarning" variant="warning">
        <p>{{ importStore.currencyMismatchWarning }}</p>
      </Callout>

      <!-- ==================== ACCOUNTS SECTION ==================== -->
      <AccountMappingTable
        v-if="importStore.needsAccountResolution && importStore.uniqueAccountsInCSV.length > 0"
        :items="importStore.uniqueAccountsInCSV"
        :mapping="importStore.accountMapping"
        :available-accounts="importLinkableAccounts"
        :title="t('pages.importExport.resolveValues.accounts.sectionTitle')"
        :resolved-label="t('importShared.resolvedCounterWord')"
        :quick-actions="accountQuickActions"
        @set-action="onAccountSetAction"
        @set-target="onAccountSetTarget"
      >
        <!-- Optional current balance for create-new accounts: the balance the account
             holds right now — the import forces it as the final value (blank = sum of
             imported transactions). -->
        <template #create-new-cell="{ item }">
          <div class="flex flex-col gap-1">
            <InputField
              type="number"
              :model-value="balanceInputValue(item.name)"
              :label="$t('pages.importExport.resolveValues.accounts.currentBalanceLabel')"
              :placeholder="$t('pages.importExport.resolveValues.accounts.currentBalancePlaceholder')"
              @update:model-value="(value) => onBalanceInput({ name: item.name, value })"
            />
            <span class="text-muted-foreground text-xs">
              {{ $t('pages.importExport.resolveValues.accounts.currentBalanceHint') }}
            </span>
          </div>
        </template>
      </AccountMappingTable>

      <!-- ==================== CATEGORIES SECTION ==================== -->
      <CategoryMappingTable
        v-if="importStore.needsCategoryResolution && importStore.uniqueCategoriesInCSV.length > 0"
        :items="categoryItems"
        :mapping="importStore.categoryMapping"
        :available-categories="formattedCategories"
        :title="t('pages.importExport.resolveValues.categories.sectionTitle')"
        :resolved-label="t('importShared.resolvedCounterWord')"
        :quick-actions="categoryQuickActions"
        @set-action="onCategorySetAction"
        @set-target="onCategorySetTarget"
      />

      <!-- ==================== TAGS SECTION ==================== -->
      <section v-if="importStore.needsTagResolution && importStore.uniqueTagsInCSV.length > 0">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold">{{ t('pages.importExport.resolveValues.tags.sectionTitle') }}</h3>
            <p class="text-muted-foreground text-xs">
              {{
                t('pages.importExport.resolveValues.tags.resolvedCount', {
                  resolved: tagResolvedCount,
                  total: importStore.uniqueTagsInCSV.length,
                })
              }}
            </p>
          </div>

          <QuickActionsToolbar :actions="tagQuickActions" />
        </div>

        <!-- Tags load failure callout -->
        <Callout v-if="importStore.tagsLoadFailed" variant="destructive" class="mb-3">
          <p>{{ t('pages.importExport.resolveValues.tags.loadFailed') }}</p>
        </Callout>

        <MappingTable
          :columns="tagColumns"
          :items="importStore.uniqueTagsInCSV"
          :row-key="(row) => row"
          :get-row-class="(row) => (getTagStatus(row) === 'needs-attention' ? 'bg-warning/5' : '')"
        >
          <template #cell:status="{ item }">
            <StatusIndicator :status="getTagStatus(item)" size="sm" />
          </template>

          <template #cell:name="{ item }">
            <span class="truncate font-medium">{{ item }}</span>
          </template>

          <template #cell:action="{ item }">
            <SelectField
              :model-value="getTagActionOption(item)"
              :values="tagActionOptions"
              class="w-full"
              :placeholder="$t('pages.importExport.resolveValues.selectAction')"
              @update:model-value="handleTagAction({ name: item, option: $event })"
            />
          </template>

          <template #cell:target="{ item }">
            <!-- link-existing: tag picker -->
            <div v-if="importStore.tagMapping[item]?.action === 'link-existing'" class="w-full">
              <p v-if="importStore.tagsLoadFailed" class="text-destructive-text text-sm">
                {{ t('pages.importExport.resolveValues.tags.loadFailed') }}
              </p>
              <p v-else-if="tags.length === 0" class="text-muted-foreground text-sm">
                {{ t('pages.importExport.resolveValues.tags.noExistingTags') }}
              </p>
              <SelectField
                v-else
                :model-value="getTagSelectValue(item)"
                :values="getTagSelectOptions()"
                class="w-full"
                clearable
                :placeholder="$t('pages.importExport.resolveValues.tags.selectTarget')"
                @update:model-value="handleTagSelect({ name: item, option: $event })"
              />
            </div>

            <!-- create-new hint -->
            <span
              v-else-if="importStore.tagMapping[item]?.action === 'create-new'"
              class="text-muted-foreground text-sm"
            >
              {{ t('pages.importExport.resolveValues.tags.willCreate', { name: item }) }}
            </span>

            <!-- skip hint -->
            <span v-else-if="importStore.tagMapping[item]?.action === 'skip'" class="text-muted-foreground text-sm">
              {{ t('pages.importExport.resolveValues.tags.willSkip') }}
            </span>

            <span v-else class="text-muted-foreground text-sm">—</span>
          </template>

          <template #empty>
            {{ t('pages.importExport.resolveValues.tags.empty') }}
          </template>
        </MappingTable>
      </section>

      <!-- ==================== BALANCE RECALCULATION ==================== -->
      <RecalculateBalanceToggle
        v-model="importStore.recalculateBalance"
        :settings-loading="importStore.recalculateBalanceSettingLoading"
        :settings-load-failed="importStore.recalculateBalanceSettingLoadFailed"
      />

      <!-- Nav error -->
      <Callout v-if="navError" variant="destructive" role="alert">
        <p>{{ navError }}</p>
      </Callout>

      <!-- Detect error from store (e.g. network failure during detectDuplicates) -->
      <Callout v-if="importStore.detectError" variant="destructive" role="alert">
        <p>{{ importStore.detectError }}</p>
      </Callout>
    </template>

    <!-- ==================== FOOTER ==================== -->
    <div
      :class="
        cn('flex items-center justify-between pt-2', importStore.isExtracting && 'pointer-events-none opacity-50')
      "
    >
      <UiButton variant="ghost" @click="importStore.goBack()">
        <ChevronLeftIcon class="mr-1.5 size-4" />
        {{ t('pages.importExport.resolveValues.footer.back') }}
      </UiButton>

      <UiButton
        :disabled="!importStore.isResolveStepValid || isNavigating || importStore.isExtracting"
        @click="handleNext"
      >
        {{ t('pages.importExport.resolveValues.footer.next') }}
        <ChevronRightIcon class="ml-1.5 size-4" />
      </UiButton>
    </div>
  </div>
</template>
