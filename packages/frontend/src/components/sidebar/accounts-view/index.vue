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
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { useVentureDeals } from '@/composable/data-queries/venture/deals';
import { waitForAnimationEnd } from '@/composable/wait-for-animation-end';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_CATEGORIES, AccountModel } from '@bt/shared/types';
import { useQuery } from '@tanstack/vue-query';
import {
  CarIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  LayersIcon,
  PlusIcon,
  RocketIcon,
  TrendingUpIcon,
} from '@lucide/vue';
import { useLocalStorage } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { Ref, computed, nextTick, provide, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useSidebarNavCollapse } from '../use-nav-collapse';
import AccountGroupsList from './account-groups-list.vue';
import AccountsList from './accounts-list.vue';
import AccountsSkeleton from './accounts-skeleton.vue';
import { useActiveAccountGroups } from './helpers/use-active-account-groups';
import PortfoliosList from './portfolios-list.vue';
import VenturesList from './ventures-list.vue';

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
// Vehicle accounts get their own "Cars" section, so keep them out of the
// Bank Accounts list.
const isVehicleAccount = (account: AccountModel) => account.accountCategory === ACCOUNT_CATEGORIES.vehicle;
const vehicleAccounts = computed(() => activeAccounts.value.filter(isVehicleAccount));
const accountsWithoutGroups = computed(() =>
  activeAccounts.value.filter((i) => !accountsInGroups.value[i.id] && !isVehicleAccount(i)),
);

const isPopoverOpen = ref(false);
const { hasAnyOpen, collapseAll } = useSidebarNavCollapse();

const isBankAccountsOpen = useLocalStorage('sidebar:accounts-bank-open', true);
const isPortfoliosOpen = useLocalStorage('sidebar:accounts-portfolios-open', true);
const isVenturesOpen = useLocalStorage('sidebar:accounts-ventures-open', true);
const isCarsOpen = useLocalStorage('sidebar:accounts-cars-open', true);

const { data: portfolios } = usePortfolios();
const portfoliosCount = computed(() => (portfolios.value ?? []).filter((p) => !p.deletedAt).length);

const { data: ventureDeals } = useVentureDeals();
const venturesCount = computed(() => (ventureDeals.value?.data ?? []).length);

const carsCount = computed(() => vehicleAccounts.value.length);

const { data: userSettings } = useUserSettings();
const showPortfolios = computed(() => userSettings.value?.sidebarSections?.portfolios ?? true);
const showVentures = computed(() => userSettings.value?.sidebarSections?.ventures ?? true);
const showVehicles = computed(() => userSettings.value?.sidebarSections?.vehicles ?? true);

const venturesVisible = computed(() => showVentures.value && venturesCount.value > 0);
const carsVisible = computed(() => showVehicles.value && carsCount.value > 0);

// Section headers stick stacked at the top (each ~2.25rem tall) and pile up at
// the bottom on scroll-up. Offsets factor in BOTH user prefs (hidden sections)
// and emptiness (zero-count ventures/cars auto-hide).
const portfoliosBottomClass = computed(() => {
  const sectionsBelow = (venturesVisible.value ? 1 : 0) + (carsVisible.value ? 1 : 0);
  if (sectionsBelow >= 2) return 'bottom-18';
  if (sectionsBelow === 1) return 'bottom-9';
  return 'bottom-0';
});
const venturesBottomClass = computed(() => (carsVisible.value ? 'bottom-9' : 'bottom-0'));
const venturesTopClass = computed(() => (showPortfolios.value ? 'top-18' : 'top-9'));
const carsTopClass = computed(() => {
  const above = (showPortfolios.value ? 1 : 0) + (venturesVisible.value ? 1 : 0);
  if (above === 2) return 'top-27';
  if (above === 1) return 'top-18';
  return 'top-9';
});

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

const isVentureRoute = computed(
  () =>
    route.name === ROUTES_NAMES.venture ||
    route.name === ROUTES_NAMES.venturePlatformsList ||
    route.name === ROUTES_NAMES.ventureDealDetail,
);
watch(
  isVentureRoute,
  (val) => {
    if (val) isVenturesOpen.value = true;
  },
  { immediate: true },
);

type SidebarSection = 'bank' | 'portfolios' | 'ventures' | 'cars';

const bankAccountsHeaderRef = ref<HTMLElement>();
const portfoliosHeaderRef = ref<HTMLElement>();
const venturesHeaderRef = ref<HTMLElement>();
const carsHeaderRef = ref<HTMLElement>();
const bankCollapsibleWrapperRef = ref<HTMLElement>();
const portfoliosCollapsibleWrapperRef = ref<HTMLElement>();
const venturesCollapsibleWrapperRef = ref<HTMLElement>();
const carsCollapsibleWrapperRef = ref<HTMLElement>();
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

const sectionRefs = {
  bank: { isOpen: isBankAccountsOpen, header: bankAccountsHeaderRef, wrapper: bankCollapsibleWrapperRef },
  portfolios: { isOpen: isPortfoliosOpen, header: portfoliosHeaderRef, wrapper: portfoliosCollapsibleWrapperRef },
  ventures: { isOpen: isVenturesOpen, header: venturesHeaderRef, wrapper: venturesCollapsibleWrapperRef },
  cars: { isOpen: isCarsOpen, header: carsHeaderRef, wrapper: carsCollapsibleWrapperRef },
};

const onSectionHeaderClick = async (section: SidebarSection) => {
  const refs = sectionRefs[section];
  const wasOpen = refs.isOpen.value;

  refs.isOpen.value = !wasOpen;

  if (!wasOpen) {
    await waitForAnimationEnd(refs.wrapper.value, 'collapsible-down');
    await scrollSectionIntoView(refs.header.value);
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

        <template v-if="showPortfolios">
          <button
            ref="portfoliosHeaderRef"
            type="button"
            class="bg-card hover:bg-accent sticky top-9 z-(--z-over-default) flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold transition-colors"
            :class="portfoliosBottomClass"
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

        <template v-if="venturesVisible">
          <button
            ref="venturesHeaderRef"
            type="button"
            class="bg-card hover:bg-accent sticky z-(--z-over-default) flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold transition-colors"
            :class="[venturesTopClass, venturesBottomClass]"
            @click="onSectionHeaderClick('ventures')"
          >
            <ChevronRightIcon
              :class="['size-4 shrink-0 transition-transform duration-200', { 'rotate-90': isVenturesOpen }]"
            />
            <RocketIcon class="text-muted-foreground size-4 shrink-0" />
            <span>{{ $t('sidebar.accountsView.ventures') }}</span>
            <span class="text-muted-foreground ml-auto text-xs tabular-nums">
              {{ venturesCount }}
            </span>
          </button>
          <div ref="venturesCollapsibleWrapperRef">
            <Collapsible v-model:open="isVenturesOpen">
              <CollapsibleContent>
                <div class="mt-0.5 mb-2">
                  <VenturesList />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </template>

        <template v-if="carsVisible">
          <button
            ref="carsHeaderRef"
            type="button"
            class="bg-card hover:bg-accent sticky bottom-0 z-(--z-over-default) flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold transition-colors"
            :class="carsTopClass"
            @click="onSectionHeaderClick('cars')"
          >
            <ChevronRightIcon
              :class="['size-4 shrink-0 transition-transform duration-200', { 'rotate-90': isCarsOpen }]"
            />
            <CarIcon class="text-muted-foreground size-4 shrink-0" />
            <span>{{ $t('sidebar.accountsView.cars') }}</span>
            <span class="text-muted-foreground ml-auto text-xs tabular-nums">
              {{ carsCount }}
            </span>
          </button>
          <div ref="carsCollapsibleWrapperRef">
            <Collapsible v-model:open="isCarsOpen">
              <CollapsibleContent>
                <div class="mt-0.5 mb-2">
                  <AccountsList :accounts="vehicleAccounts" />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </template>
      </template>
    </ScrollArea>
  </div>
</template>
