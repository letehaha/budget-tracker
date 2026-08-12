<script setup lang="ts">
import GroupLogo from '@/components/common/group-logo.vue';
import { Button } from '@/components/lib/ui/button';
import GroupTotal from '@/components/sidebar/accounts-view/group-total.vue';
import { useBaseBalanceTotals } from '@/composable/use-base-balance-totals';
import { cn } from '@/lib/utils';
import { goToConnectionDetails } from '@/routes/navigation';
import { ChevronDownIcon, Settings2Icon } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

import type { AccountGroupListItem } from './build-account-group-list';
import DeleteGroup from './group-row/delete-group.vue';
import EditGroupForm from './group-row/edit-group-form.vue';
import GroupAccountRow from './group-row/group-account-row.vue';

const props = defineProps<{ item: AccountGroupListItem; expanded: boolean }>();

const emit = defineEmits<{ toggle: [] }>();

const { t } = useI18n();
const router = useRouter();

const group = computed(() => props.item.group);
const isBankLinked = computed(() => !!group.value.bankDataProviderConnectionId);
const accountsCount = computed(() => group.value.accounts.length);

const { baseCurrencyCode, sumBaseBalance } = useBaseBalanceTotals();

// Own accounts only: this list is flat, so a nested group renders as its own row and
// rolling its accounts up into the parent here would count them twice.
const total = computed(() => sumBaseBalance({ accounts: group.value.accounts }));

const subtitle = computed(() => {
  const parts = [
    accountsCount.value > 0
      ? t('settings.accountGroups.row.accountsCount', { count: accountsCount.value }, accountsCount.value)
      : t('settings.accountGroups.row.noAccounts'),
  ];

  if (props.item.parentName) {
    parts.push(t('settings.accountGroups.row.inParent', { name: props.item.parentName }));
  }

  return parts.join(' · ');
});
</script>

<template>
  <div>
    <button
      type="button"
      :aria-expanded="expanded"
      :class="
        cn(
          'grid w-full grid-cols-[minmax(0,1fr)_auto_14px] items-center gap-3 px-4 py-3 text-left',
          'hover:bg-muted/40 focus-visible:ring-ring/40 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:outline-none',
        )
      "
      @click="emit('toggle')"
    >
      <div class="flex min-w-0 items-center gap-3">
        <GroupLogo :group="group" size="size-9" variant="tile" />

        <div class="min-w-0">
          <div class="flex min-w-0 flex-wrap items-center gap-1.5">
            <span class="truncate text-sm font-semibold">{{ group.name }}</span>

            <span
              v-if="isBankLinked"
              class="bg-primary/15 text-primary-text shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            >
              <span class="hidden @[30rem]/account-groups:inline">
                {{ $t('settings.accountGroups.row.bankBadge') }}
              </span>
              <span class="@[30rem]/account-groups:hidden">
                {{ $t('settings.accountGroups.row.bankBadgeShort') }}
              </span>
            </span>
          </div>

          <div class="text-muted-foreground mt-0.5 truncate text-xs">{{ subtitle }}</div>
        </div>
      </div>

      <GroupTotal
        v-if="baseCurrencyCode"
        :amount="total.total"
        :currency-code="baseCurrencyCode"
        :is-approx="total.isApprox"
        show-zero
      />

      <ChevronDownIcon
        class="text-muted-foreground size-3.5 transition-transform"
        :class="{ 'rotate-180': expanded }"
        aria-hidden="true"
      />
    </button>

    <div v-if="expanded" class="border-border/60 bg-muted/20 border-t px-4 py-4">
      <EditGroupForm :group="group" />

      <div class="bg-border/60 my-4 h-px w-full" />

      <h4 class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
        {{ $t('settings.accountGroups.accounts.heading') }}
      </h4>

      <div
        v-if="accountsCount"
        class="border-border/60 bg-card divide-border/60 divide-y overflow-hidden rounded-lg border"
      >
        <GroupAccountRow v-for="account in group.accounts" :key="account.id" :account="account" :group-id="group.id" />
      </div>
      <p v-else class="text-muted-foreground text-sm">{{ $t('settings.accountGroups.accounts.empty') }}</p>

      <div class="mt-4 flex flex-wrap items-center justify-end gap-3">
        <Button
          v-if="isBankLinked"
          variant="outline"
          size="sm"
          class="mr-auto"
          @click="goToConnectionDetails({ router, connectionId: group.bankDataProviderConnectionId })"
        >
          <Settings2Icon class="size-4" />
          {{ $t('settings.accountGroups.row.manageConnection') }}
        </Button>

        <DeleteGroup :group="group" />
      </div>
    </div>
  </div>
</template>
