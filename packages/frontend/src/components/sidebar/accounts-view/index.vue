<script setup lang="ts">
import { loadAccountGroups } from '@/api/account-groups';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { AccountGroups } from '@/common/types/models';
import CreateAccountGroupDialog from '@/components/dialogs/account-groups/create-account-group-dialog.vue';
import CreateAccountDialog from '@/components/dialogs/create-account-dialog.vue';
import CreatePortfolioDialog from '@/components/dialogs/create-portfolio-dialog.vue';
import Button from '@/components/lib/ui/button/Button.vue';
import * as Popover from '@/components/lib/ui/popover';
import { ScrollArea } from '@/components/lib/ui/scroll-area';
import { SCROLL_AREA_IDS } from '@/components/lib/ui/scroll-area/types';
import { useLoans } from '@/composable/data-queries/loans';
import { portfolioSummaryQueryOptions } from '@/composable/data-queries/portfolio-summary';
import { usePortfolios } from '@/composable/data-queries/portfolios';
import { useUserSettings } from '@/composable/data-queries/user-settings';
import { useVentureDeals } from '@/composable/data-queries/venture/deals';
import { useIdleEnabled } from '@/composable/use-idle-enabled';
import { useSidebarSections } from '@/composable/use-sidebar-sections';
import { waitForAnimationEnd } from '@/composable/wait-for-animation-end';
import { partitionLoans } from '@/pages/loans/utils/partition-loans';
import { ROUTES_NAMES } from '@/routes/constants';
import { useAccountsStore, useCurrenciesStore } from '@/stores';
import { ACCOUNT_CATEGORIES, AccountModel } from '@bt/shared/types';
import { useQueries, useQuery } from '@tanstack/vue-query';
import {
  CarIcon,
  ChevronsUpDownIcon,
  HandCoinsIcon,
  LayersIcon,
  PlusIcon,
  RocketIcon,
  TrendingUpIcon,
} from '@lucide/vue';
import { useLocalStorage } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { Ref, computed, nextTick, provide, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import SidebarSettingsPopover from '../sidebar-settings-popover.vue';
import { useSidebarNavCollapse } from '../use-nav-collapse';
import AccountGroupsList from './account-groups-list.vue';
import AccountsList from './accounts-list.vue';
import AccountsSkeleton from './accounts-skeleton.vue';
import GroupTotal from './group-total.vue';
import { sumAccountsBaseBalance } from './helpers/account-totals';
import { computeStickyOffsets } from './helpers/sticky-offsets';
import { useActiveAccountGroups } from './helpers/use-active-account-groups';
import LoansList from './loans-list.vue';
import PortfoliosList from './portfolios-list.vue';
import SidebarCollapsibleSection from './sidebar-collapsible-section.vue';
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
// Vehicle and loan accounts get their own "Cars" and "Loans" sections, so keep
// them out of the Bank Accounts list.
const isVehicleAccount = (account: AccountModel) => account.accountCategory === ACCOUNT_CATEGORIES.vehicle;
const isLoanAccount = (account: AccountModel) => account.accountCategory === ACCOUNT_CATEGORIES.loan;
const vehicleAccounts = computed(() => activeAccounts.value.filter(isVehicleAccount));
const accountsWithoutGroups = computed(() =>
  activeAccounts.value.filter((i) => !accountsInGroups.value[i.id] && !isVehicleAccount(i) && !isLoanAccount(i)),
);

const isPopoverOpen = ref(false);
const { hasAnyOpen, collapseAll } = useSidebarNavCollapse();

const isBankAccountsOpen = useLocalStorage('sidebar:accounts-bank-open', true);
const isPortfoliosOpen = useLocalStorage('sidebar:accounts-portfolios-open', true);
const isVenturesOpen = useLocalStorage('sidebar:accounts-ventures-open', true);
const isCarsOpen = useLocalStorage('sidebar:accounts-cars-open', true);
const isLoansOpen = useLocalStorage('sidebar:accounts-loans-open', true);

const { baseCurrency } = storeToRefs(useCurrenciesStore());
const baseCurrencyCode = computed(() => baseCurrency.value?.currency?.code);
const { data: userSettings } = useUserSettings();
const includeCreditLimit = computed(() => !!userSettings.value?.includeCreditLimitInStats);

// Bank Accounts total = every account rendered under the section (grouped + ungrouped).
const bankAccountsTotal = computed(() =>
  sumAccountsBaseBalance({
    accounts: [...Object.values(accountsInGroups.value), ...accountsWithoutGroups.value],
    baseCurrencyCode: baseCurrencyCode.value,
    includeCreditLimit: includeCreditLimit.value,
  }),
);

// Non-critical sidebar batches (portfolio roll-up summaries, venture deals) are deferred until
// the browser is idle so above-the-fold dashboard data loads first.
const idleEnabled = useIdleEnabled();

const { data: portfolios } = usePortfolios();
const visiblePortfolios = computed(() => (portfolios.value ?? []).filter((p) => !p.deletedAt));

// One summary query per portfolio via the shared factory, so these dedupe with the per-row
// usePortfolioSummary calls (identical cache keys) instead of firing a second request each.
// Only this eager sidebar roll-up is idle-gated; the per-row usePortfolioSummary keeps its own
// enabled logic, so a portfolio detail page visited directly still fetches immediately.
const portfolioSummaries = useQueries({
  queries: computed(() =>
    visiblePortfolios.value.map((portfolio) => ({
      ...portfolioSummaryQueryOptions({ portfolioId: portfolio.id }),
      enabled: idleEnabled.value,
    })),
  ),
});

const portfoliosTotal = computed(() => {
  let total = 0;
  for (const result of portfolioSummaries.value) {
    if (!result.data) continue;
    total += Number(result.data.totalPortfolioValueInBaseCurrency);
  }
  // Portfolio values are FX-blended market estimates — holdings priced in their own currencies,
  // converted to base — so the roll-up is always approximate.
  return { total, isApprox: true };
});
const isPortfoliosTotalLoading = computed(() => portfolioSummaries.value.some((result) => result.isLoading));

const { data: ventureDeals } = useVentureDeals({ enabled: idleEnabled });
const venturesCount = computed(() => (ventureDeals.value?.data ?? []).length);

// Cars total = vehicle accounts in base currency.
const carsTotal = computed(() =>
  sumAccountsBaseBalance({
    accounts: vehicleAccounts.value,
    baseCurrencyCode: baseCurrencyCode.value,
    includeCreditLimit: includeCreditLimit.value,
  }),
);
const carsCount = computed(() => vehicleAccounts.value.length);

const { data: loans } = useLoans();
const activeLoans = computed(() => partitionLoans({ loans: loans.value ?? [] }).active);
const loansCount = computed(() => activeLoans.value.length);
// Loans are liabilities (negative balances), so this total reads red like the loan rows.
const loansTotal = computed(() =>
  sumAccountsBaseBalance({
    accounts: activeLoans.value,
    baseCurrencyCode: baseCurrencyCode.value,
    includeCreditLimit: includeCreditLimit.value,
  }),
);

const { sidebarSections } = useSidebarSections();
const showPortfolios = computed(() => sidebarSections.value.portfolios);
const showVentures = computed(() => sidebarSections.value.ventures);
const showVehicles = computed(() => sidebarSections.value.vehicles);
const showLoans = computed(() => sidebarSections.value.loans);

const venturesVisible = computed(() => showVentures.value && venturesCount.value > 0);
const carsVisible = computed(() => showVehicles.value && carsCount.value > 0);
const loansVisible = computed(() => showLoans.value && loansCount.value > 0);

type SidebarSection = 'bank' | 'portfolios' | 'ventures' | 'cars' | 'loans';

// Ordered, top-to-bottom section list. `orderedVisibleSections` drops the ones hidden by user
// prefs or emptiness (zero-count ventures/cars/loans auto-hide); `computeStickyOffsets` turns
// that order into per-section stacked sticky-header offsets. Bank is always first and rendered
// with a plain `top-0` and no bottom, so its computed entry is only used to count sections above.
const SIDEBAR_SECTIONS = [
  'bank',
  'portfolios',
  'ventures',
  'cars',
  'loans',
] as const satisfies readonly SidebarSection[];

const orderedVisibleSections = computed<SidebarSection[]>(() =>
  (
    [
      { key: 'bank', visible: true },
      { key: 'portfolios', visible: showPortfolios.value },
      { key: 'ventures', visible: venturesVisible.value },
      { key: 'cars', visible: carsVisible.value },
      { key: 'loans', visible: loansVisible.value },
    ] as const
  )
    .filter((section) => section.visible)
    .map((section) => section.key),
);

const stickyOffsets = computed(() =>
  computeStickyOffsets({ allKeys: SIDEBAR_SECTIONS, visibleInOrder: orderedVisibleSections.value }),
);

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

const isLoanRoute = computed(() => route.name === ROUTES_NAMES.loanDetail);
watch(
  isLoanRoute,
  (val) => {
    if (val) isLoansOpen.value = true;
  },
  { immediate: true },
);

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

// When a section expands, wait for its open animation to settle, then bring its header into view.
const onSectionExpand = async ({ headerEl, wrapperEl }: { headerEl?: HTMLElement; wrapperEl?: HTMLElement }) => {
  await waitForAnimationEnd(wrapperEl, 'collapsible-down');
  await scrollSectionIntoView(headerEl);
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

      <div class="flex items-center gap-1">
        <SidebarSettingsPopover />

        <Popover.Popover :open="isPopoverOpen" @update:open="isPopoverOpen = $event">
          <Popover.PopoverTrigger as-child>
            <Button size="icon-sm" variant="secondary">
              <PlusIcon :class="['size-3.5 transition-transform', isPopoverOpen && '-rotate-45']" />
            </Button>
          </Popover.PopoverTrigger>
          <Popover.PopoverContent side="bottom" align="end">
            <div class="grid gap-2">
              <CreateAccountDialog @created="isPopoverOpen = false">
                <Button type="button" size="sm" variant="secondary">
                  {{ $t('sidebar.accountsView.newAccount') }}
                </Button>
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
    </div>

    <ScrollArea ref="scrollAreaRef" :scroll-area-id="SCROLL_AREA_IDS.sidebarAccounts" class="flex-1">
      <template v-if="isLoading">
        <AccountsSkeleton />
      </template>
      <template v-else>
        <SidebarCollapsibleSection
          v-model:open="isBankAccountsOpen"
          :icon="LayersIcon"
          :label="$t('sidebar.accountsView.bankAccounts')"
          top-class="top-0"
          @expand="onSectionExpand"
        >
          <template v-if="baseCurrencyCode" #trailing>
            <GroupTotal
              :amount="bankAccountsTotal.total"
              :currency-code="baseCurrencyCode"
              :is-approx="bankAccountsTotal.isApprox"
              emphasis
            />
          </template>
          <AccountGroupsList :groups="accountGroups ?? []" />
          <AccountsList :accounts="accountsWithoutGroups" />
        </SidebarCollapsibleSection>

        <SidebarCollapsibleSection
          v-if="showPortfolios"
          v-model:open="isPortfoliosOpen"
          :icon="TrendingUpIcon"
          :label="$t('sidebar.accountsView.portfolios')"
          :top-class="stickyOffsets.portfolios.top"
          :bottom-class="stickyOffsets.portfolios.bottom"
          @expand="onSectionExpand"
        >
          <template v-if="baseCurrencyCode" #trailing>
            <GroupTotal
              :amount="portfoliosTotal.total"
              :currency-code="baseCurrencyCode"
              :is-approx="portfoliosTotal.isApprox"
              :loading="isPortfoliosTotalLoading"
              emphasis
            />
          </template>
          <PortfoliosList />
        </SidebarCollapsibleSection>

        <SidebarCollapsibleSection
          v-if="venturesVisible"
          v-model:open="isVenturesOpen"
          :icon="RocketIcon"
          :label="$t('sidebar.accountsView.ventures')"
          :count="venturesCount"
          :top-class="stickyOffsets.ventures.top"
          :bottom-class="stickyOffsets.ventures.bottom"
          @expand="onSectionExpand"
        >
          <VenturesList />
        </SidebarCollapsibleSection>

        <SidebarCollapsibleSection
          v-if="carsVisible"
          v-model:open="isCarsOpen"
          :icon="CarIcon"
          :label="$t('sidebar.accountsView.cars')"
          :top-class="stickyOffsets.cars.top"
          :bottom-class="stickyOffsets.cars.bottom"
          @expand="onSectionExpand"
        >
          <template v-if="baseCurrencyCode" #trailing>
            <GroupTotal
              :amount="carsTotal.total"
              :currency-code="baseCurrencyCode"
              :is-approx="carsTotal.isApprox"
              emphasis
            />
          </template>
          <AccountsList :accounts="vehicleAccounts" />
        </SidebarCollapsibleSection>

        <SidebarCollapsibleSection
          v-if="loansVisible"
          v-model:open="isLoansOpen"
          :icon="HandCoinsIcon"
          :label="$t('sidebar.accountsView.loans')"
          :top-class="stickyOffsets.loans.top"
          :bottom-class="stickyOffsets.loans.bottom"
          @expand="onSectionExpand"
        >
          <template v-if="baseCurrencyCode" #trailing>
            <GroupTotal
              :amount="loansTotal.total"
              :currency-code="baseCurrencyCode"
              :is-approx="loansTotal.isApprox"
              emphasis
            />
          </template>
          <LoansList />
        </SidebarCollapsibleSection>
      </template>
    </ScrollArea>
  </div>
</template>
