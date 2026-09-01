<script lang="ts">
/** Every account decision this table can render. */
export type AccountAction = 'create-new' | 'link-existing' | 'skip';
</script>

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
import AccountSelectField from '@/components/fields/account-select-field.vue';
import SelectField from '@/components/fields/select-field.vue';
import { MappingTable, type MappingTableColumn } from '@/components/lib/ui/mapping-table';
import { StatusIndicator } from '@/components/lib/ui/status-indicator';
import type {
  AccountModel,
  AccountMappingValue,
  BudgetBakersWalletAccountMappingValue,
  MsMoneyAccountMappingValue,
} from '@bt/shared/types';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import QuickActionsToolbar, { type QuickAction } from './quick-action-toolbar.vue';

const { t } = useI18n();

/** Source account discovered upstream. `transactionCount` is informational. */
interface SourceItem {
  name: string;
  /** Stable mapping key when the display name is not unique. Defaults to `name`. */
  mappingKey?: string;
  currency: string;
  transactionCount?: number;
}

/**
 * Read-only view of a single account mapping decision. CSV's
 * `AccountMappingValue`, BudgetBakers Wallet's and MS Money's account mapping
 * values are all structurally assignable to this — extra fields on the
 * `create-new` variants (`currentBalance`, `currencyCode`) are tolerated.
 */
type AccountMappingView = { action: AccountAction; accountId?: string };

// Compile-time guard: every source union type must remain assignable to
// AccountMappingView so a future change to any of them surfaces here rather
// than silently breaking the component at runtime.
type _AssertAccountMappingViewCompat = [
  AccountMappingValue extends AccountMappingView ? true : never,
  BudgetBakersWalletAccountMappingValue extends AccountMappingView ? true : never,
  MsMoneyAccountMappingValue extends AccountMappingView ? true : never,
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
  /**
   * Adds a "skip" choice to the action picker. Only importers whose wire type
   * carries a `skip` account action turn this on; the rest must not offer a
   * decision the backend would reject.
   */
  allowSkip?: boolean;
}>();

const emit = defineEmits<{
  'set-action': [payload: { name: string; action: AccountAction }];
  'set-target': [payload: { name: string; accountId: string }];
}>();

// ---- Option lists ----

interface OptionItem<V extends string = string> {
  label: string;
  value: V;
}

const actionOptions = computed<OptionItem<AccountAction>[]>(() => [
  { label: t('importShared.action.createNew'), value: 'create-new' },
  { label: t('importShared.action.linkExisting'), value: 'link-existing' },
  ...(props.allowSkip ? [{ label: t('importShared.action.skip'), value: 'skip' as const }] : []),
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

type ResolveRowStatus = 'auto-matched' | 'will-create' | 'needs-attention' | 'skipped';

/** Existing importers key mappings by display name. OFX can supply an opaque key. */
function getMappingKey(item: SourceItem): string {
  return item.mappingKey ?? item.name;
}

/** create-new ⇒ will-create; skip ⇒ skipped; link-existing with a target ⇒
 *  auto-matched; otherwise needs-attention. */
function getStatus(name: string): ResolveRowStatus {
  const m = props.mapping[name];
  if (!m) return 'needs-attention';
  if (m.action === 'create-new') return 'will-create';
  if (m.action === 'skip') return 'skipped';
  if (m.action === 'link-existing') return m.accountId ? 'auto-matched' : 'needs-attention';
  return 'needs-attention';
}

const resolvedCount = computed(
  () => props.items.filter((item) => getStatus(getMappingKey(item)) !== 'needs-attention').length,
);

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

function isAccountAlreadyMapped({ account, currentName }: { account: AccountModel; currentName: string }): boolean {
  const mappedTo = accountIdToSourceName.value[String(account.id)];
  return mappedTo !== undefined && mappedTo !== currentName;
}

function getActionOption(name: string): OptionItem<AccountAction> | null {
  const m = props.mapping[name];
  if (!m) return null;
  return actionOptions.value.find((o) => o.value === m.action) ?? null;
}

function getSelectedAccount(name: string): AccountModel | null {
  const m = props.mapping[name];
  if (m?.action !== 'link-existing' || !m.accountId) return null;
  return props.availableAccounts.find((a) => String(a.id) === m.accountId) ?? null;
}

// ---- Emit handlers ----

function onActionChange({ name, option }: { name: string; option: OptionItem<AccountAction> | null }) {
  if (!option) return;
  emit('set-action', { name, action: option.value });
}

function onTargetChange({ name, account }: { name: string; account: AccountModel | null }) {
  emit('set-target', { name, accountId: account ? String(account.id) : '' });
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
      :row-key="getMappingKey"
      :get-row-class="(row) => (getStatus(getMappingKey(row)) === 'needs-attention' ? 'bg-warning/5' : '')"
    >
      <template #cell:status="{ item }">
        <StatusIndicator :status="getStatus(getMappingKey(item))" size="sm" />
      </template>

      <template #cell:name="{ item }">
        <span class="truncate font-medium">{{ item.name }}</span>
      </template>

      <template #cell:currency="{ item }">
        <span class="text-muted-foreground text-xs">{{ item.currency || '—' }}</span>
      </template>

      <template #cell:action="{ item }">
        <SelectField
          :model-value="getActionOption(getMappingKey(item))"
          :values="actionOptions"
          class="w-full"
          :placeholder="$t('importShared.selectAction')"
          @update:model-value="onActionChange({ name: getMappingKey(item), option: $event })"
        />
      </template>

      <template #cell:target="{ item }">
        <!-- link-existing: currency-filtered account picker -->
        <div v-if="mapping[getMappingKey(item)]?.action === 'link-existing'" class="w-full">
          <p v-if="getFilteredAccounts(item.currency).length === 0" class="text-destructive-text text-sm">
            {{ $t('importShared.account.noMatchingCurrency', { currency: item.currency }) }}
          </p>
          <AccountSelectField
            v-else
            :model-value="getSelectedAccount(getMappingKey(item))"
            :accounts="getFilteredAccounts(item.currency)"
            class="w-full"
            include-archived
            clearable
            :placeholder="$t('importShared.account.selectTarget')"
            :option-disabled="
              (account: AccountModel) => isAccountAlreadyMapped({ account, currentName: getMappingKey(item) })
            "
            @update:model-value="onTargetChange({ name: getMappingKey(item), account: $event })"
          />
        </div>

        <!-- create-new: parent may override the cell (e.g. Wallet's balance input);
             default content is the shared "will create" hint. -->
        <template v-else-if="mapping[getMappingKey(item)]?.action === 'create-new'">
          <slot name="create-new-cell" :item="item">
            <span class="text-muted-foreground text-sm">
              {{ $t('importShared.account.willCreate', { name: item.name, currency: item.currency || '—' }) }}
            </span>
          </slot>
        </template>

        <span v-else-if="mapping[getMappingKey(item)]?.action === 'skip'" class="text-muted-foreground text-sm">
          {{ $t('importShared.account.willSkip') }}
        </span>

        <span v-else class="text-muted-foreground text-sm">—</span>
      </template>

      <template #empty>
        {{ $t('importShared.account.empty') }}
      </template>
    </MappingTable>
  </section>
</template>
