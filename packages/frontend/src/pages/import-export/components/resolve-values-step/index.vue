<script setup lang="ts">
import { type FormattedCategory } from '@/common/types';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Callout } from '@/components/lib/ui/callout';
import { MappingTable, type MappingTableColumn } from '@/components/lib/ui/mapping-table';
import { StatusIndicator } from '@/components/lib/ui/status-indicator';
import { cn } from '@/lib/utils';
import { useCategoriesStore } from '@/stores/categories/categories';
import { useImportExportStore } from '@/stores/import-export';
import { useTagsStore } from '@/stores/tags';
import { useAccountsStore } from '@/stores/accounts';
import type { SourceAccount, AccountMappingValue, CategoryMappingValue, TagMappingValue } from '@bt/shared/types';
import { buildCategoryMapById } from '@/pages/import-export/utils/flatten-categories';
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

const { accounts } = storeToRefs(accountsStore);
const { formattedCategories } = storeToRefs(categoriesStore);
const { tags } = storeToRefs(tagsStore);

// ---- Option lists ----

interface OptionItem<V extends string = string> {
  label: string;
  value: V;
}

/** Shared action choices for accounts and categories: link an existing record or create a new one. */
const linkOrCreateOptions = computed<OptionItem<AccountMappingValue['action']>[]>(() => [
  { label: t('pages.importExport.resolveValues.actions.createNew'), value: 'create-new' },
  { label: t('pages.importExport.resolveValues.actions.linkExisting'), value: 'link-existing' },
]);

const tagActionOptions = computed<OptionItem<TagMappingValue['action']>[]>(() => [
  { label: t('pages.importExport.resolveValues.actions.createNew'), value: 'create-new' },
  { label: t('pages.importExport.resolveValues.actions.linkExisting'), value: 'link-existing' },
  { label: t('pages.importExport.resolveValues.actions.skip'), value: 'skip' },
]);

// ---- Table column definitions ----

const accountColumns: MappingTableColumn[] = [
  { key: 'status', label: '', width: '36px', hideLabelInCard: true, cardHeader: true },
  {
    key: 'name',
    label: t('pages.importExport.resolveValues.accounts.csvName'),
    width: 'minmax(0,1fr)',
    cardHeader: true,
  },
  {
    key: 'currency',
    label: t('pages.importExport.resolveValues.accounts.currency'),
    width: '80px',
    cardValue: 'inline',
  },
  { key: 'action', label: t('pages.importExport.resolveValues.accounts.action'), width: '160px', cardValue: 'control' },
  {
    key: 'target',
    label: t('pages.importExport.resolveValues.accounts.target'),
    width: 'minmax(0,1fr)',
    cardValue: 'control',
  },
];

const categoryColumns: MappingTableColumn[] = [
  { key: 'status', label: '', width: '36px', hideLabelInCard: true, cardHeader: true },
  {
    key: 'name',
    label: t('pages.importExport.resolveValues.categories.csvName'),
    width: 'minmax(0,1fr)',
    cardHeader: true,
  },
  {
    key: 'action',
    label: t('pages.importExport.resolveValues.categories.action'),
    width: '160px',
    cardValue: 'control',
  },
  {
    key: 'target',
    label: t('pages.importExport.resolveValues.categories.target'),
    width: 'minmax(0,1fr)',
    cardValue: 'control',
  },
];

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

// ---- Status derivation ----

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

function getAccountStatus({ name }: SourceAccount): ResolveRowStatus {
  const m = importStore.accountMapping[name];
  return resolveRowStatus({ action: m?.action, hasTarget: m?.action === 'link-existing' && !!m.accountId });
}

function getCategoryStatus(name: string): ResolveRowStatus {
  const m = importStore.categoryMapping[name];
  return resolveRowStatus({ action: m?.action, hasTarget: m?.action === 'link-existing' && !!m.categoryId });
}

function getTagStatus(name: string): ResolveRowStatus {
  const m = importStore.tagMapping[name];
  return resolveRowStatus({ action: m?.action, hasTarget: m?.action === 'link-existing' && !!m.tagId });
}

// ---- Resolution counts for section headers ----

const accountResolvedCount = computed(
  () => importStore.uniqueAccountsInCSV.filter((a) => getAccountStatus(a) !== 'needs-attention').length,
);

const categoryResolvedCount = computed(
  () => importStore.uniqueCategoriesInCSV.filter((c) => getCategoryStatus(c) !== 'needs-attention').length,
);

const tagResolvedCount = computed(
  () => importStore.uniqueTagsInCSV.filter((tg) => getTagStatus(tg) !== 'needs-attention').length,
);

// ---- Account mapping helpers ----

/** Currency-filtered existing accounts for a given source account's currency. */
function getFilteredAccounts(currency: string) {
  if (!currency) return accounts.value ?? [];
  return (accounts.value ?? []).filter((acc) => acc.currencyCode === currency);
}

/** Accounts already linked to another CSV name (to disable them in other rows). */
const accountIdToCSVName = computed(() => {
  const mapping: Record<string, string> = {};
  for (const [csvName, value] of Object.entries(importStore.accountMapping)) {
    if (value.action === 'link-existing') {
      mapping[value.accountId] = csvName;
    }
  }
  return mapping;
});

function isAccountAlreadyMapped({ accountId, currentCSVName }: { accountId: string; currentCSVName: string }): boolean {
  const mappedTo = accountIdToCSVName.value[accountId];
  return mappedTo !== undefined && mappedTo !== currentCSVName;
}

function getAccountActionOption(name: string): OptionItem<AccountMappingValue['action']> | null {
  const mapping = importStore.accountMapping[name];
  if (!mapping) return null;
  return linkOrCreateOptions.value.find((o) => o.value === mapping.action) ?? null;
}

function handleAccountAction({
  name,
  option,
}: {
  name: string;
  option: OptionItem<AccountMappingValue['action']> | null;
}) {
  if (!option) {
    delete importStore.accountMapping[name];
    return;
  }
  if (option.value === 'create-new') {
    importStore.accountMapping[name] = { action: 'create-new' };
  } else if (option.value === 'link-existing') {
    importStore.accountMapping[name] = { action: 'link-existing', accountId: '' };
  }
}

function getAccountSelectOptions(currency: string): OptionItem[] {
  return getFilteredAccounts(currency).map((acc) => ({
    label: `${acc.name} (${acc.currencyCode})`,
    value: String(acc.id),
  }));
}

function getAccountSelectValue(name: string): OptionItem | null {
  const mapping = importStore.accountMapping[name];
  if (mapping?.action !== 'link-existing' || !mapping.accountId) return null;
  const acc = (accounts.value ?? []).find((a) => String(a.id) === mapping.accountId);
  if (!acc) return null;
  return { label: `${acc.name} (${acc.currencyCode})`, value: String(acc.id) };
}

function handleAccountSelect({ name, option }: { name: string; option: OptionItem | null }) {
  if (option) {
    importStore.accountMapping[name] = { action: 'link-existing', accountId: option.value };
  } else {
    importStore.accountMapping[name] = { action: 'link-existing', accountId: '' };
  }
}

// ---- Category mapping helpers ----

/** id → category lookup, used to resolve a stored categoryId back to its full category for the picker. */
const categoryMapById = computed(() => buildCategoryMapById({ categories: formattedCategories.value }));

function getCategoryActionOption(name: string): OptionItem<CategoryMappingValue['action']> | null {
  const mapping = importStore.categoryMapping[name];
  if (!mapping) return null;
  return linkOrCreateOptions.value.find((o) => o.value === mapping.action) ?? null;
}

function handleCategoryAction({
  name,
  option,
}: {
  name: string;
  option: OptionItem<CategoryMappingValue['action']> | null;
}) {
  if (!option) {
    delete importStore.categoryMapping[name];
    return;
  }
  if (option.value === 'create-new') {
    importStore.categoryMapping[name] = { action: 'create-new' };
  } else if (option.value === 'link-existing') {
    importStore.categoryMapping[name] = { action: 'link-existing', categoryId: '' };
  }
}

function getCategorySelectValue(name: string): FormattedCategory | null {
  const mapping = importStore.categoryMapping[name];
  if (mapping?.action !== 'link-existing' || !mapping.categoryId) return null;
  return categoryMapById.value.get(mapping.categoryId) ?? null;
}

function handleCategorySelect({ name, category }: { name: string; category: FormattedCategory | null }) {
  if (category) {
    importStore.categoryMapping[name] = { action: 'link-existing', categoryId: category.id };
  } else {
    importStore.categoryMapping[name] = { action: 'link-existing', categoryId: '' };
  }
}

// ---- Tag mapping helpers ----

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
      <section v-if="importStore.needsAccountResolution && importStore.uniqueAccountsInCSV.length > 0">
        <!-- Section header -->
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold">{{ t('pages.importExport.resolveValues.accounts.sectionTitle') }}</h3>
            <p class="text-muted-foreground text-xs">
              {{
                t('pages.importExport.resolveValues.accounts.resolvedCount', {
                  resolved: accountResolvedCount,
                  total: importStore.uniqueAccountsInCSV.length,
                })
              }}
            </p>
          </div>

          <!-- Quick actions: inline buttons on a wide container, overflow menu on a narrow one -->
          <QuickActionsToolbar :actions="accountQuickActions" />
        </div>

        <MappingTable
          :columns="accountColumns"
          :items="importStore.uniqueAccountsInCSV"
          :row-key="(row) => row.name"
          :get-row-class="(row) => (getAccountStatus(row) === 'needs-attention' ? 'bg-warning/5' : '')"
        >
          <template #cell:status="{ item }">
            <StatusIndicator :status="getAccountStatus(item)" size="sm" />
          </template>

          <template #cell:name="{ item }">
            <span class="truncate font-medium">{{ item.name }}</span>
          </template>

          <template #cell:currency="{ item }">
            <span class="text-muted-foreground text-xs">{{ item.currency || '—' }}</span>
          </template>

          <template #cell:action="{ item }">
            <SelectField
              :model-value="getAccountActionOption(item.name)"
              :values="linkOrCreateOptions"
              class="w-full"
              :placeholder="$t('pages.importExport.resolveValues.selectAction')"
              @update:model-value="handleAccountAction({ name: item.name, option: $event })"
            />
          </template>

          <template #cell:target="{ item }">
            <!-- link-existing: currency-filtered account picker -->
            <div v-if="importStore.accountMapping[item.name]?.action === 'link-existing'" class="w-full">
              <p v-if="getFilteredAccounts(item.currency).length === 0" class="text-destructive-text text-sm">
                {{ t('pages.importExport.resolveValues.accounts.noMatchingCurrency', { currency: item.currency }) }}
              </p>
              <SelectField
                v-else
                :model-value="getAccountSelectValue(item.name)"
                :values="getAccountSelectOptions(item.currency)"
                class="w-full"
                clearable
                :placeholder="$t('pages.importExport.resolveValues.accounts.selectTarget')"
                :option-disabled="
                  (opt: OptionItem) => isAccountAlreadyMapped({ accountId: opt.value, currentCSVName: item.name })
                "
                @update:model-value="handleAccountSelect({ name: item.name, option: $event })"
              />
            </div>

            <!-- create-new hint -->
            <span
              v-else-if="importStore.accountMapping[item.name]?.action === 'create-new'"
              class="text-muted-foreground text-sm"
            >
              {{
                t('pages.importExport.resolveValues.accounts.willCreate', {
                  name: item.name,
                  currency: item.currency || '—',
                })
              }}
            </span>

            <span v-else class="text-muted-foreground text-sm">—</span>
          </template>

          <template #empty>
            {{ t('pages.importExport.resolveValues.accounts.empty') }}
          </template>
        </MappingTable>
      </section>

      <!-- ==================== CATEGORIES SECTION ==================== -->
      <section v-if="importStore.needsCategoryResolution && importStore.uniqueCategoriesInCSV.length > 0">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="text-sm font-semibold">
              {{ t('pages.importExport.resolveValues.categories.sectionTitle') }}
            </h3>
            <p class="text-muted-foreground text-xs">
              {{
                t('pages.importExport.resolveValues.categories.resolvedCount', {
                  resolved: categoryResolvedCount,
                  total: importStore.uniqueCategoriesInCSV.length,
                })
              }}
            </p>
          </div>

          <QuickActionsToolbar :actions="categoryQuickActions" />
        </div>

        <MappingTable
          :columns="categoryColumns"
          :items="importStore.uniqueCategoriesInCSV"
          :row-key="(row) => row"
          :get-row-class="(row) => (getCategoryStatus(row) === 'needs-attention' ? 'bg-warning/5' : '')"
        >
          <template #cell:status="{ item }">
            <StatusIndicator :status="getCategoryStatus(item)" size="sm" />
          </template>

          <template #cell:name="{ item }">
            <span class="truncate font-medium">{{ item }}</span>
          </template>

          <template #cell:action="{ item }">
            <SelectField
              :model-value="getCategoryActionOption(item)"
              :values="linkOrCreateOptions"
              class="w-full"
              :placeholder="$t('pages.importExport.resolveValues.selectAction')"
              @update:model-value="handleCategoryAction({ name: item, option: $event })"
            />
          </template>

          <template #cell:target="{ item }">
            <!-- link-existing: category tree picker -->
            <div v-if="importStore.categoryMapping[item]?.action === 'link-existing'" class="w-full">
              <CategorySelectField
                :model-value="getCategorySelectValue(item)"
                :values="formattedCategories"
                label-key="name"
                :placeholder="$t('pages.importExport.resolveValues.categories.selectTarget')"
                popover-class-name="min-w-60"
                @update:model-value="handleCategorySelect({ name: item, category: $event })"
              />
            </div>

            <!-- create-new hint -->
            <i18n-t
              v-else-if="importStore.categoryMapping[item]?.action === 'create-new'"
              keypath="pages.importExport.resolveValues.categories.willCreate"
              tag="span"
              class="text-muted-foreground text-sm"
            >
              <template #name>
                <span class="text-foreground font-medium">{{ item }}</span>
              </template>
            </i18n-t>

            <span v-else class="text-muted-foreground text-sm">—</span>
          </template>

          <template #empty>
            {{ t('pages.importExport.resolveValues.categories.empty') }}
          </template>
        </MappingTable>
      </section>

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
