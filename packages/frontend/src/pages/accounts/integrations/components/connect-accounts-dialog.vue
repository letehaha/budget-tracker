<template>
  <ResponsiveDialog v-model:open="isOpen" dialog-content-class="max-w-xl">
    <template #title>{{ $t('pages.integrations.details.fetchAccountsDialog.title') }}</template>
    <template #description>
      {{ $t('pages.integrations.details.fetchAccountsDialog.description', { providerName }) }}
    </template>

    <div class="flex flex-col gap-4">
      <Popover.Popover>
        <Popover.PopoverTrigger class="text-primary-text flex cursor-pointer items-center gap-2 text-sm">
          {{ $t('pages.integrations.details.fetchAccountsDialog.missingAccountsQuestion') }}
          <InfoIcon class="size-4" />
        </Popover.PopoverTrigger>
        <Popover.PopoverContent class="max-w-[320px]">
          <i18n-t
            keypath="pages.integrations.details.fetchAccountsDialog.missingAccountsHint"
            tag="p"
            class="text-sm leading-6"
          >
            <template #section>
              <strong>{{ $t('pages.integrations.details.fetchAccountsDialog.missingAccountsSectionName') }}</strong>
            </template>
            <template #button>
              <strong>{{ $t('pages.integrations.details.fetchAccountsDialog.missingAccountsButtonName') }}</strong>
            </template>
          </i18n-t>
          <p class="text-muted-foreground mt-2 text-sm">
            {{ $t('pages.integrations.details.fetchAccountsDialog.missingAccountsPersist') }}
          </p>
        </Popover.PopoverContent>
      </Popover.Popover>

      <div v-if="isLoading" class="flex flex-col gap-2" aria-hidden="true">
        <div v-for="i in 3" :key="i" class="bg-muted h-14.5 animate-pulse rounded-lg" />
      </div>

      <div v-else-if="errorType" class="border-destructive text-destructive-text rounded-lg border p-4 text-sm">
        <p v-if="errorType === 'forbidden'">
          {{ $t('pages.integrations.details.fetchAccountsDialog.sessionExpired') }}
        </p>
        <p v-else>{{ $t('pages.integrations.details.fetchAccountsDialog.loadFailed') }}</p>
      </div>

      <p v-else-if="accounts && accounts.length === 0" class="text-muted-foreground py-8 text-center text-sm">
        {{ $t('pages.integrations.details.fetchAccountsDialog.noAdditionalAccounts') }}
      </p>

      <template v-else-if="accounts">
        <div v-if="selectableAccounts.length" class="flex flex-col gap-2">
          <div class="flex min-h-8 items-center justify-between gap-2">
            <div class="flex items-baseline gap-1.5">
              <span class="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
                {{ $t('pages.integrations.details.fetchAccountsDialog.availableLabel') }}
              </span>
              <span class="text-muted-foreground/70 text-xs font-medium tabular-nums">
                {{ selectableAccounts.length }}
              </span>
            </div>
            <UiButton variant="ghost-primary" size="sm" :disabled="isConnecting" @click="toggleAll">
              {{
                allSelected
                  ? $t('pages.integrations.details.fetchAccountsDialog.clearAll')
                  : $t('pages.integrations.common.selectAll')
              }}
            </UiButton>
          </div>

          <div
            v-for="account in selectableAccounts"
            :key="account.externalId"
            :class="
              cn(
                'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                isConnecting ? 'cursor-default opacity-80' : 'cursor-pointer',
                isSelected(account.externalId)
                  ? 'border-primary bg-primary/10'
                  : cn('border-border', !isConnecting && 'hover:border-primary/45'),
              )
            "
            @click="toggle(account.externalId)"
          >
            <AccountVisualChip :account="account" :provider-type="providerType" />

            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-semibold">{{ account.name }}</span>
                <span
                  class="border-border text-muted-foreground shrink-0 rounded border px-1.5 py-px text-[10px] font-bold tracking-wide"
                >
                  {{ account.currency }}
                </span>
              </div>
              <p v-if="secondaryMeta(account)" class="text-muted-foreground mt-0.5 truncate text-xs tabular-nums">
                {{ secondaryMeta(account) }}
              </p>
            </div>

            <span
              :class="
                cn(
                  'shrink-0 text-sm font-semibold whitespace-nowrap tabular-nums',
                  account.balance === 0 && 'text-muted-foreground font-normal',
                )
              "
            >
              {{ formatBalance(account.balance) }}
            </span>

            <Checkbox
              :model-value="isSelected(account.externalId)"
              :disabled="isConnecting"
              class="size-5"
              :aria-label="account.name"
              @update:model-value="toggle(account.externalId)"
              @click.stop
            />
          </div>
        </div>

        <p v-else class="text-muted-foreground py-4 text-center text-sm">
          {{ $t('pages.integrations.details.fetchAccountsDialog.noAdditionalAccounts') }}
        </p>

        <Collapsible v-if="connectedAccounts.length" v-slot="{ open }">
          <CollapsibleTrigger
            class="text-muted-foreground flex items-center gap-2 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase"
          >
            <ChevronRightIcon :class="cn('size-3.5 transition-transform', open && 'rotate-90')" />
            {{ $t('pages.integrations.details.fetchAccountsDialog.alreadyConnected') }}
            <span class="text-muted-foreground/70 font-medium tracking-normal tabular-nums">
              {{ connectedAccounts.length }}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="flex flex-col gap-1.5 pt-1.5">
              <div
                v-for="account in connectedAccounts"
                :key="account.externalId"
                class="bg-card text-muted-foreground flex items-center gap-3 rounded-lg px-3 py-2 text-sm"
              >
                <span class="bg-success-text size-1.5 shrink-0 rounded-full" aria-hidden="true" />
                <AccountVisualChip :account="account" :provider-type="providerType" />
                <span class="min-w-0 flex-1 truncate">{{ account.name }}</span>
                <span class="shrink-0 text-xs whitespace-nowrap tabular-nums">
                  {{ formatBalance(account.balance) }} {{ account.currency }}
                </span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </template>
    </div>

    <template #footer="{ close }">
      <div class="grid w-full gap-3 sm:grid-cols-2">
        <UiButton variant="outline" @click="close">{{ $t('common.actions.cancel') }}</UiButton>
        <UiButton :disabled="isConnecting || selectedIds.length === 0" @click="emit('connect', selectedIds)">
          <Loader2Icon v-if="isConnecting" class="size-4 animate-spin" />
          {{
            selectedIds.length
              ? $t('pages.integrations.details.fetchAccountsDialog.connectSelectedButton', {
                  count: selectedIds.length,
                })
              : $t('pages.integrations.details.fetchAccountsDialog.selectAccountsButton')
          }}
        </UiButton>
      </div>
    </template>
  </ResponsiveDialog>
</template>

<script lang="ts" setup>
import type { AvailableAccount } from '@/api/bank-data-providers';
import ResponsiveDialog from '@/components/common/responsive-dialog.vue';
import UiButton from '@/components/lib/ui/button/Button.vue';
import { Checkbox } from '@/components/lib/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/lib/ui/collapsible';
import * as Popover from '@/components/lib/ui/popover';
import { cn } from '@/lib/utils';
import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { ChevronRightIcon, InfoIcon, Loader2Icon } from '@lucide/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { formatIbanCompact, getAccountSecondaryMeta } from '../utils/account-visual';
import AccountVisualChip from './account-visual-chip.vue';

const props = defineProps<{
  open: boolean;
  accounts: AvailableAccount[] | undefined;
  isLoading: boolean;
  errorType: 'forbidden' | 'generic' | null;
  connectedExternalIds: Set<string>;
  providerName: string;
  providerType: BANK_PROVIDER_TYPE | undefined;
  isConnecting: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  connect: [externalIds: string[]];
}>();

const { t } = useI18n();

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value),
});

const selectedIds = ref<string[]>([]);

const selectableAccounts = computed(
  () => props.accounts?.filter((account) => !props.connectedExternalIds.has(account.externalId)) ?? [],
);
const connectedAccounts = computed(
  () => props.accounts?.filter((account) => props.connectedExternalIds.has(account.externalId)) ?? [],
);

const isSelected = (externalId: string) => selectedIds.value.includes(externalId);

const toggle = (externalId: string) => {
  if (props.isConnecting) return;
  selectedIds.value = isSelected(externalId)
    ? selectedIds.value.filter((id) => id !== externalId)
    : [...selectedIds.value, externalId];
};

const allSelected = computed(
  () => selectableAccounts.value.length > 0 && selectedIds.value.length === selectableAccounts.value.length,
);

const toggleAll = () => {
  if (props.isConnecting) return;
  selectedIds.value = allSelected.value ? [] : selectableAccounts.value.map((account) => account.externalId);
};

const formatBalance = (amount: number) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

const secondaryMeta = (account: AvailableAccount): string | null => {
  const { iban, creditLimitCents } = getAccountSecondaryMeta({ metadata: account.metadata });
  if (creditLimitCents) {
    return t('pages.integrations.details.fetchAccountsDialog.creditLimitMeta', {
      amount: `${formatBalance(creditLimitCents / 100)} ${account.currency}`,
    });
  }
  if (iban) return formatIbanCompact({ iban });
  if (props.providerType !== BANK_PROVIDER_TYPE.MONOBANK) return account.type;
  return null;
};

watch(isOpen, (open) => {
  if (!open) selectedIds.value = [];
});
</script>
