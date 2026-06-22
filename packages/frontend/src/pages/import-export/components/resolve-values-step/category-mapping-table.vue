<script setup lang="ts">
/**
 * CategoryMappingTable — shared, prop-driven table for reconciling a list of
 * source category names against the user's existing categories. Each row is
 * either "create a new category" or "link to an existing category" (the link
 * target is a hierarchical <CategorySelectField>). Used by both the CSV and
 * Wallet importers.
 *
 * Like AccountMappingTable, this is presentational over the mapping decision:
 * the parent store owns `mapping` and applies the `set-action` / `set-target`
 * emits. Status derivation and the id→category lookup are table-internal.
 *
 * Generic table chrome comes from the shared `pages/import-shared` i18n chunk
 * via `importShared.*`, so both wizards render identical wording.
 */
import { type FormattedCategory } from '@/common/types';
import CategorySelectField from '@/components/fields/category-select-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import { MappingTable, type MappingTableColumn } from '@/components/lib/ui/mapping-table';
import { StatusIndicator } from '@/components/lib/ui/status-indicator';
import { buildCategoryMapById } from '@/pages/import-export/utils/flatten-categories';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import QuickActionsToolbar, { type QuickAction } from './quick-action-toolbar.vue';

const { t } = useI18n();

/** Source category discovered upstream. `transactionCount` is informational. */
interface SourceItem {
  name: string;
  transactionCount?: number;
}

/**
 * Read-only view of a single category mapping decision. CSV's
 * `CategoryMappingValue` is structurally assignable to this.
 */
type CategoryMappingView = { action: 'create-new' | 'link-existing'; categoryId?: string };

const props = defineProps<{
  items: SourceItem[];
  mapping: Record<string, CategoryMappingView>;
  /** Existing categories offered as link targets (hierarchical picker). */
  availableCategories: FormattedCategory[];
  title: string;
  /** Localized word for the resolved counter, e.g. "resolved". */
  resolvedLabel: string;
  /** Bulk-action buttons the parent builds with i18n labels + store handlers. */
  quickActions: QuickAction[];
}>();

const emit = defineEmits<{
  'set-action': [payload: { name: string; action: 'create-new' | 'link-existing' }];
  'set-target': [payload: { name: string; categoryId: string }];
}>();

// ---- Option lists ----

interface OptionItem<V extends string = string> {
  label: string;
  value: V;
}

const linkOrCreateOptions = computed<OptionItem<'create-new' | 'link-existing'>[]>(() => [
  { label: t('importShared.action.createNew'), value: 'create-new' },
  { label: t('importShared.action.linkExisting'), value: 'link-existing' },
]);

// ---- Columns (status 36px, name 1fr, action 160px, target 1fr) ----

const columns = computed<MappingTableColumn[]>(() => [
  { key: 'status', label: '', width: '36px', hideLabelInCard: true, cardHeader: true },
  { key: 'name', label: t('importShared.columns.sourceName'), width: 'minmax(0,1fr)', cardHeader: true },
  { key: 'action', label: t('importShared.columns.action'), width: '160px', cardValue: 'control' },
  { key: 'target', label: t('importShared.columns.target'), width: 'minmax(0,1fr)', cardValue: 'control' },
]);

// ---- Status derivation ----

type ResolveRowStatus = 'auto-matched' | 'will-create' | 'needs-attention';

/** create-new ⇒ will-create; link-existing with a target ⇒ auto-matched; otherwise needs-attention. */
function getStatus(name: string): ResolveRowStatus {
  const m = props.mapping[name];
  if (!m) return 'needs-attention';
  if (m.action === 'create-new') return 'will-create';
  if (m.action === 'link-existing') return m.categoryId ? 'auto-matched' : 'needs-attention';
  return 'needs-attention';
}

const resolvedCount = computed(() => props.items.filter((item) => getStatus(item.name) !== 'needs-attention').length);

// ---- Link-target helpers ----

/** id → category lookup, resolves a stored categoryId back to its full category for the picker. */
const categoryMapById = computed(() => buildCategoryMapById({ categories: props.availableCategories }));

function getActionOption(name: string): OptionItem<'create-new' | 'link-existing'> | null {
  const m = props.mapping[name];
  if (!m) return null;
  return linkOrCreateOptions.value.find((o) => o.value === m.action) ?? null;
}

function getSelectValue(name: string): FormattedCategory | null {
  const m = props.mapping[name];
  if (m?.action !== 'link-existing' || !m.categoryId) return null;
  return categoryMapById.value.get(m.categoryId) ?? null;
}

// ---- Emit handlers ----

function onActionChange({ name, option }: { name: string; option: OptionItem<'create-new' | 'link-existing'> | null }) {
  if (!option) return;
  emit('set-action', { name, action: option.value });
}

function onTargetChange({ name, category }: { name: string; category: FormattedCategory | null }) {
  emit('set-target', { name, categoryId: category?.id ?? '' });
}
</script>

<template>
  <section>
    <!-- Section header: title + resolved counter on the left, quick actions on the right -->
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold">{{ title }}</h3>
        <p class="text-muted-foreground text-xs">{{ resolvedCount }} / {{ items.length }} {{ resolvedLabel }}</p>
      </div>

      <QuickActionsToolbar :actions="quickActions" />
    </div>

    <MappingTable
      :columns="columns"
      :items="items"
      :row-key="(row) => row.name"
      :get-row-class="(row) => (getStatus(row.name) === 'needs-attention' ? 'bg-warning/5' : '')"
    >
      <template #cell:status="{ item }">
        <StatusIndicator :status="getStatus(item.name)" size="sm" />
      </template>

      <template #cell:name="{ item }">
        <span class="truncate font-medium">{{ item.name }}</span>
      </template>

      <template #cell:action="{ item }">
        <SelectField
          :model-value="getActionOption(item.name)"
          :values="linkOrCreateOptions"
          class="w-full"
          :placeholder="$t('importShared.selectAction')"
          @update:model-value="onActionChange({ name: item.name, option: $event })"
        />
      </template>

      <template #cell:target="{ item }">
        <!-- link-existing: hierarchical category picker -->
        <div v-if="mapping[item.name]?.action === 'link-existing'" class="w-full">
          <CategorySelectField
            :model-value="getSelectValue(item.name)"
            :values="availableCategories"
            label-key="name"
            :placeholder="$t('importShared.category.selectTarget')"
            popover-class-name="min-w-60"
            @update:model-value="onTargetChange({ name: item.name, category: $event })"
          />
        </div>

        <!-- create-new hint -->
        <i18n-t
          v-else-if="mapping[item.name]?.action === 'create-new'"
          keypath="importShared.category.willCreate"
          tag="span"
          class="text-muted-foreground text-sm"
        >
          <template #name>
            <span class="text-foreground font-medium">{{ item.name }}</span>
          </template>
        </i18n-t>

        <span v-else class="text-muted-foreground text-sm">—</span>
      </template>

      <template #empty>
        {{ $t('importShared.category.empty') }}
      </template>
    </MappingTable>
  </section>
</template>
