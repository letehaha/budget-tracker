<template>
  <div class="space-y-2">
    <div v-if="showSelectAll && accounts.length > 1" class="flex justify-end">
      <label class="flex cursor-pointer items-center gap-2 text-sm select-none">
        <Checkbox :model-value="selectAllState" @update:model-value="(val) => toggleAll(val === true)" />
        {{ t('pages.integrations.common.selectAll') }}
      </label>
    </div>

    <label
      v-for="account in accounts"
      :key="account.externalId"
      class="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border p-3"
    >
      <Checkbox
        :model-value="selectedIds.includes(account.externalId)"
        @update:model-value="(val) => toggleAccount(account.externalId, val === true)"
      />
      <div class="bg-muted flex size-8 items-center justify-center rounded-full">
        <BuildingIcon class="text-muted-foreground size-4" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate font-medium">{{ account.name }}</div>
        <div v-if="institutionNameOf(account)" class="text-muted-foreground truncate text-xs">
          {{ institutionNameOf(account) }}
        </div>
      </div>
      <div class="text-right">
        <div class="text-sm font-medium">{{ formatAmountByCurrencyCode(account.balance, account.currency) }}</div>
        <div class="text-muted-foreground text-xs">{{ account.currency }}</div>
      </div>
    </label>
  </div>
</template>

<script lang="ts" setup>
import { type AvailableAccount } from '@/api/bank-data-providers';
import { Checkbox, type CheckedState } from '@/components/lib/ui/checkbox';
import { useFormatCurrency } from '@/composable/formatters';
import { BuildingIcon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    accounts: AvailableAccount[];
    /** Show the tri-state "select all" toggle (only rendered when >1 account). */
    showSelectAll?: boolean;
  }>(),
  {
    showSelectAll: true,
  },
);

// Selected external IDs, two-way bound by the parent connector.
const selectedIds = defineModel<string[]>({ required: true });

const { t } = useI18n();
const { formatAmountByCurrencyCode } = useFormatCurrency();

// Tri-state: every account picked -> checked, none -> unchecked, partial -> indeterminate.
const selectAllState = computed<CheckedState>(() => {
  if (selectedIds.value.length === 0) return false;
  if (selectedIds.value.length === props.accounts.length) return true;
  return 'indeterminate';
});

const toggleAccount = (externalId: string, checked: boolean) => {
  selectedIds.value = checked
    ? [...selectedIds.value, externalId]
    : selectedIds.value.filter((id) => id !== externalId);
};

const toggleAll = (checked: boolean) => {
  selectedIds.value = checked ? props.accounts.map((account) => account.externalId) : [];
};

// `metadata` is an untyped bag from the provider; read institutionName safely.
const institutionNameOf = (account: AvailableAccount): string =>
  typeof account.metadata?.institutionName === 'string' ? account.metadata.institutionName : '';
</script>
