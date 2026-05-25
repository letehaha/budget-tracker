<script setup lang="ts">
import { loadAccountGroups } from '@/api/account-groups';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AccountGroups } from '@/common/types/models';
import CreateAccountGroupDialog from '@/components/dialogs/account-groups/create-account-group-dialog.vue';
import CreateAccountDialog from '@/components/dialogs/create-account-dialog.vue';
import CreatePortfolioDialog from '@/components/dialogs/create-portfolio-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import { Collapsible, CollapsibleContent } from '@/components/lib/ui/collapsible';
import * as Popover from '@/components/lib/ui/popover';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { usePortfolios } from '@/composable/data-queries/portfolios';
import { waitForAnimationEnd } from '@/composable/wait-for-animation-end';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import { AccountModel } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import { ChevronRightIcon, ChevronsUpDownIcon, LayersIcon, PlusIcon, TrendingUpIcon } from '@lucide/vue';
import { storeToRefs } from 'pinia';
import { Ref, computed, nextTick, provide, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useSidebarNavCollapse } from '../use-nav-collapse';
import AccountGroupsList from './account-groups-list.vue';
import AccountsList from './accounts-list.vue';
import AccountsSkeleton from './accounts-skeleton.vue';
import { useActiveAccountGroups } from './helpers/use-active-account-groups';
import PortfoliosList from './portfolios-list.vue';

const accountsStore = useAccountsStore();
const { activeAccounts, isAccountsFetched } = storeToRefs(accountsStore);
const { data: accountGroups, isLoading: isGroupsLoading } = useQuery({
  queryFn: () => loadAccountGroups(),
  queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
  staleTime: Infinity,
  placeholderData: [],
});

// Wait for both accounts and groups to load to prevent layout shift
const isLoading = computed(() => !isAccountsFetched.value || isGroupsLoading.value);

const accountGroupsContext = useActiveAccountGroups(accountGroups as Ref<AccountGroups[]>);
provide('accountGroupsContext', accountGroupsContext);

const accountsInGroups = computed(() => {
  const flattenAccounts = (groups: AccountGroups[]): Record<string, AccountModel> =>
    groups.reduce(
      (acc, group) => {
        group.accounts.forEach((account) => {
          acc[account.id] = account;
        });
        if (group.childGroups.length) {
          Object.assign(acc, flattenAccounts(group.childGroups));
        }
        return acc;
      },
      {} as Record<string, AccountModel>,
    );

  return flattenAccounts(accountGroups.value ?? []);
});
const accountsWithoutGroups = computed(() => activeAccounts.value.filter((i) => !accountsInGroups.value[i.id]));

const isPopoverOpen = ref(false);
const { hasAnyOpen, collapseAll } = useSidebarNavCollapse();

const isBankAccountsOpen = ref(true);
const isPortfoliosOpen = ref(true);

const { data: portfolios } = usePortfolios();
const portfoliosCount = computed(() => (portfolios.value ?? []).filter((p) => !p.deletedAt).length);

const route = useRoute();
const isPortfolioRoute = computed(
  () => route.name === ROUTES_NAMES.portfolioDetail || route.name === ROUTES_NAMES.portfolioTransactionsImport,
);
watch(
  isPortfolioRoute,
  (val) => {
    if (val) isPortfoliosOpen.value = true;
  },
  { immediate: true },
);

const bankAccountsHeaderRef = ref<HTMLElement>();
const portfoliosHeaderRef = ref<HTMLElement>();
const bankCollapsibleWrapperRef = ref<HTMLElement>();
const portfoliosCollapsibleWrapperRef = ref<HTMLElement>();
const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);

const scrollSectionIntoView = async (sectionEl: HTMLElement | undefined) => {
  if (!sectionEl) return;
  await nextTick();
  const viewport = scrollAreaRef.value?.viewportRef?.viewportElement;
  if (!viewport) return;
  const sectionRect = sectionEl.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const top = sectionRect.top - viewportRect.top + viewport.scrollTop;
  viewport.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
};

const onSectionHeaderClick = async (section: 'bank' | 'portfolios') => {
  const wasOpen = section === 'bank' ? isBankAccountsOpen.value : isPortfoliosOpen.value;

  if (section === 'bank') {
    isBankAccountsOpen.value = !isBankAccountsOpen.value;
  } else {
    isPortfoliosOpen.value = !isPortfoliosOpen.value;
  }

  if (!wasOpen) {
    const wrapper = section === 'bank' ? bankCollapsibleWrapperRef.value : portfoliosCollapsibleWrapperRef.value;
    await waitForAnimationEnd(wrapper, 'collapsible-down');

    const target = section === 'bank' ? bankAccountsHeaderRef.value : portfoliosHeaderRef.value;
    await scrollSectionIntoView(target);
  }
};
</script>

<template>
  <div class="flex min-h-25 flex-1 flex-col gap-1.5 overflow-y-hidden">
    <div class="flex items-center justify-between px-1">
      <button
        type="button"
        class="text-muted-foreground -mx-1 flex items-center gap-1 rounded px-1 py-0.5 transition-colors"
        :class="hasAnyOpen ? 'cursor-pointer' : 'cursor-default'"
        :disabled="!hasAnyOpen"
        :aria-label="$t('sidebar.accountsView.collapseNavigation')"
        @click="collapseAll"
      >
        <span class="text-[11px] font-semibold tracking-wider uppercase">
          {{ $t('sidebar.accountsView.title') }}
        </span>
        <ChevronsUpDownIcon v-if="hasAnyOpen" class="size-3" />
      </button>

      <Popover.Popover :open="isPopoverOpen" @update:open="isPopoverOpen = $event">
        <Popover.PopoverTrigger as-child>
          <Button size="icon-sm" variant="secondary">
            <PlusIcon :class="['size-3.5 transition-transform', isPopoverOpen && '-rotate-45']" />
          </Button>
        </Popover.PopoverTrigger>
        <Popover.PopoverContent side="bottom" align="end">
          <div class="grid gap-2">
            <CreateAccountDialog @created="isPopoverOpen = false">
              <Button type="button" size="sm" variant="secondary"> {{ $t('sidebar.accountsView.newAccount') }} </Button>
            </CreateAccountDialog>

            <CreateAccountGroupDialog @created="isPopoverOpen = false">
              <Button type="button" size="sm" variant="secondary">
                {{ $t('sidebar.accountsView.newAccountsGroup') }}
              </Button>
            </CreateAccountGroupDialog>

            <CreatePortfolioDialog @created="isPopoverOpen = false">
              <Button type="button" size="sm" variant="secondary">
                {{ $t('sidebar.accountsView.newPortfolio') }}
              </Button>
            </CreatePortfolioDialog>
          </div>
        </Popover.PopoverContent>
      </Popover.Popover>
    </div>

    <ScrollArea ref="scrollAreaRef" :scroll-area-id="SCROLL_AREA_IDS.sidebarAccounts" class="flex-1">
      <template v-if="isLoading">
        <AccountsSkeleton />
      </template>
      <template v-else>
        <button
          ref="bankAccountsHeaderRef"
          type="button"
          class="bg-card hover:bg-accent sticky top-0 z-(--z-over-default) flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold transition-colors"
          @click="onSectionHeaderClick('bank')"
        >
          <ChevronRightIcon
            :class="['size-4 shrink-0 transition-transform duration-200', { 'rotate-90': isBankAccountsOpen }]"
          />
          <LayersIcon class="text-muted-foreground size-4 shrink-0" />
          <span>{{ $t('sidebar.accountsView.bankAccounts') }}</span>
        </button>
        <div ref="bankCollapsibleWrapperRef">
          <Collapsible v-model:open="isBankAccountsOpen">
            <CollapsibleContent>
              <div class="mt-0.5 mb-2">
                <AccountGroupsList :groups="accountGroups ?? []" />
                <AccountsList :accounts="accountsWithoutGroups" />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <button
          ref="portfoliosHeaderRef"
          type="button"
          class="bg-card hover:bg-accent sticky top-9 bottom-0 z-(--z-over-default) flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold transition-colors"
          @click="onSectionHeaderClick('portfolios')"
        >
          <ChevronRightIcon
            :class="['size-4 shrink-0 transition-transform duration-200', { 'rotate-90': isPortfoliosOpen }]"
          />
          <TrendingUpIcon class="text-muted-foreground size-4 shrink-0" />
          <span>{{ $t('sidebar.accountsView.portfolios') }}</span>
          <span v-if="portfoliosCount" class="text-muted-foreground ml-auto text-xs tabular-nums">
            {{ portfoliosCount }}
          </span>
        </button>
        <div ref="portfoliosCollapsibleWrapperRef">
          <Collapsible v-model:open="isPortfoliosOpen">
            <CollapsibleContent>
              <div class="mt-0.5 mb-2">
                <PortfoliosList />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </template>
    </ScrollArea>
  </div>
</template>
