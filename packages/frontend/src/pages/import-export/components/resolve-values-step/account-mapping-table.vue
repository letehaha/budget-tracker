<script setup lang="ts">
/**
 * AccountMappingTable — shared, prop-driven table for reconciling a list of
 * source account names against the user's existing app accounts. Each row is
 * either "create a new account" or "link to an existing account" (the link
 * target is currency-filtered). Used by both the CSV and Wallet importers.
 *
 * The component is purely presentational over the mapping decision: the parent
 * store owns `mapping` and applies the `set-action` / `set-target` emits; this
 * component never mutates the store directly. Status derivation, currency
 * filtering, and disabling already-linked targets are table-internal concerns
 * and live here.
 *
 * The generic table chrome (action option labels, the "will create" hint, the
 * resolved counter word) comes from the shared `pages/import-shared` i18n chunk
 * via the `importShared.*` keys, so both wizards render identical wording.
 */
import SelectField from '@/components/fields/select-field.vue';
import { MappingTable, type MappingTableColumn } from '@/components/lib/ui/mapping-table';
import { StatusIndicator } from '@/components/lib/ui/status-indicator';
import type { AccountModel, AccountMappingValue, WalletAccountMappingValue } from '@bt/shared/types';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import QuickActionsToolbar, { type QuickAction } from './quick-action-toolbar.vue';

const { t } = useI18n();

/** Source account discovered upstream. `transactionCount` is informational. */
interface SourceItem {
  name: string;
  currency: string;
  transactionCount?: number;
}

/**
 * Read-only view of a single account mapping decision. Both CSV's
 * `AccountMappingValue` and Wallet's `WalletAccountMappingValue` are
 * structurally assignable to this — extra fields on Wallet's `create-new`
 * variant (currencyCode/currentBalance) are tolerated.
 */
type AccountMappingView = { action: 'create-new' | 'link-existing'; accountId?: string };

// Compile-time guard: both source union types must remain assignable to
// AccountMappingView so a future change to either type surfaces here rather
// than silently breaking the component at runtime.
type _AssertAccountMappingViewCompat = [
  AccountMappingValue extends AccountMappingView ? true : never,
  WalletAccountMappingValue extends AccountMappingView ? true : never,
];

const props = defineProps<{
  items: SourceItem[];
  mapping: Record<string, AccountMappingView>;
  /** Existing app accounts offered as link targets (filtered by currency). */
  availableAccounts: AccountModel[];
  title: string;
  /** Localized word for the resolved counter, e.g. "resolved". */
  resolvedLabel: string;
  /** Bulk-action buttons the parent builds with i18n labels + store handlers. */
  quickActions: QuickAction[];
}>();

const emit = defineEmits<{
  'set-action': [payload: { name: string; action: 'create-new' | 'link-existing' }];
  'set-target': [payload: { name: string; accountId: string }];
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

// ---- Columns (status 36px, name 1fr, currency 80px, action 160px, target 1fr) ----

const columns = computed<MappingTableColumn[]>(() => [
  { key: 'status', label: '', width: '36px', hideLabelInCard: true, cardHeader: true },
  { key: 'name', label: t('importShared.columns.sourceName'), width: 'minmax(0,1fr)', cardHeader: true },
  { key: 'currency', label: t('importShared.columns.currency'), width: '80px', cardValue: 'inline' },
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
  if (m.action === 'link-existing') return m.accountId ? 'auto-matched' : 'needs-attention';
  return 'needs-attention';
}

const resolvedCount = computed(() => props.items.filter((item) => getStatus(item.name) !== 'needs-attention').length);

// ---- Link-target helpers ----

/** Currency-filtered existing accounts for a given source account's currency. */
function getFilteredAccounts(currency: string): AccountModel[] {
  if (!currency) return props.availableAccounts;
  return props.availableAccounts.filter((acc) => acc.currencyCode === currency);
}

/** Account id → the source name it is already linked to, used to disable it elsewhere. */
const accountIdToSourceName = computed(() => {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(props.mapping)) {
    if (value.action === 'link-existing' && value.accountId) {
      result[value.accountId] = name;
    }
  }
  return result;
});

function isAccountAlreadyMapped({ accountId, currentName }: { accountId: string; currentName: string }): boolean {
  const mappedTo = accountIdToSourceName.value[accountId];
  return mappedTo !== undefined && mappedTo !== currentName;
}

function getActionOption(name: string): OptionItem<'create-new' | 'link-existing'> | null {
  const m = props.mapping[name];
  if (!m) return null;
  return linkOrCreateOptions.value.find((o) => o.value === m.action) ?? null;
}

function getSelectOptions(currency: string): OptionItem[] {
  return getFilteredAccounts(currency).map((acc) => ({
    label: `${acc.name} (${acc.currencyCode})`,
    value: String(acc.id),
  }));
}

function getSelectValue(name: string): OptionItem | null {
  const m = props.mapping[name];
  if (m?.action !== 'link-existing' || !m.accountId) return null;
  const acc = props.availableAccounts.find((a) => String(a.id) === m.accountId);
  if (!acc) return null;
  return { label: `${acc.name} (${acc.currencyCode})`, value: String(acc.id) };
}

// ---- Emit handlers ----

function onActionChange({ name, option }: { name: string; option: OptionItem<'create-new' | 'link-existing'> | null }) {
  if (!option) return;
  emit('set-action', { name, action: option.value });
}

function onTargetChange({ name, option }: { name: string; option: OptionItem | null }) {
  emit('set-target', { name, accountId: option?.value ?? '' });
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

      <template #cell:currency="{ item }">
        <span class="text-muted-foreground text-xs">{{ item.currency || '—' }}</span>
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
        <!-- link-existing: currency-filtered account picker -->
        <div v-if="mapping[item.name]?.action === 'link-existing'" class="w-full">
          <p v-if="getFilteredAccounts(item.currency).length === 0" class="text-destructive-text text-sm">
            {{ $t('importShared.account.noMatchingCurrency', { currency: item.currency }) }}
          </p>
          <SelectField
            v-else
            :model-value="getSelectValue(item.name)"
            :values="getSelectOptions(item.currency)"
            class="w-full"
            clearable
            :placeholder="$t('importShared.account.selectTarget')"
            :option-disabled="
              (opt: OptionItem) => isAccountAlreadyMapped({ accountId: opt.value, currentName: item.name })
            "
            @update:model-value="onTargetChange({ name: item.name, option: $event })"
          />
        </div>

        <!-- create-new: parent may override the cell (e.g. Wallet's balance input);
             default content is the shared "will create" hint. -->
        <template v-else-if="mapping[item.name]?.action === 'create-new'">
          <slot name="create-new-cell" :item="item">
            <span class="text-muted-foreground text-sm">
              {{ $t('importShared.account.willCreate', { name: item.name, currency: item.currency || '—' }) }}
            </span>
          </slot>
        </template>

        <span v-else class="text-muted-foreground text-sm">—</span>
      </template>

      <template #empty>
        {{ $t('importShared.account.empty') }}
      </template>
    </MappingTable>
  </section>
</template>
