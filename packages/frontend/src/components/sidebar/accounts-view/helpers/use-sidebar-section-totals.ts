import { loadAccountGroups } from '@/api/account-groups';
import { VUE_QUERY_CACHE_KEYS } from '@/common/const';
import { useLoans } from '@/composable/data-queries/loans';
import { portfolioSummaryQueryOptions } from '@/composable/data-queries/portfolio-summary';
import { usePortfolios } from '@/composable/data-queries/portfolios';
import { useVentureDeals } from '@/composable/data-queries/venture/deals';
import { useBaseBalanceTotals } from '@/composable/use-base-balance-totals';
import { useIdleEnabled } from '@/composable/use-idle-enabled';
import { useSidebarSections } from '@/composable/use-sidebar-sections';
import { partitionLoans } from '@/pages/loans/utils/partition-loans';
import { useAccountsStore } from '@/stores';
import { ACCOUNT_CATEGORIES, AccountModel } from '@bt/shared/types';
import { useQueries, useQuery } from '@tanstack/vue-query';
import { storeToRefs } from 'pinia';
import { computed } from 'vue';

import { flattenAccounts } from './account-totals';

/**
 * Per-section account splits, base-currency totals and visibility flags for the accounts view.
 * Every query here is keyed the same way as its standalone counterpart, so these dedupe with the
 * per-row calls instead of firing a second request each.
 */
export const useSidebarSectionTotals = () => {
  const { activeAccounts, isAccountsFetched } = storeToRefs(useAccountsStore());
  const { data: accountGroupsData, isLoading: isGroupsLoading } = useQuery({
    queryFn: () => loadAccountGroups(),
    queryKey: VUE_QUERY_CACHE_KEYS.accountGroups,
    staleTime: Infinity,
    placeholderData: [],
  });

  const accountGroups = computed(() => accountGroupsData.value ?? []);

  // Wait for both accounts and groups to load to prevent layout shift
  const isLoading = computed(() => !isAccountsFetched.value || isGroupsLoading.value);

  const accountsInGroups = computed(() => flattenAccounts({ groups: accountGroups.value }));

  // Vehicle and loan accounts get their own "Cars" and "Loans" sections, so keep
  // them out of the Bank Accounts list.
  const isVehicleAccount = (account: AccountModel) => account.accountCategory === ACCOUNT_CATEGORIES.vehicle;
  const isPropertyAccount = (account: AccountModel) => account.accountCategory === ACCOUNT_CATEGORIES.property;
  const isLoanAccount = (account: AccountModel) => account.accountCategory === ACCOUNT_CATEGORIES.loan;
  const vehicleAccounts = computed(() => activeAccounts.value.filter(isVehicleAccount));
  const propertyAccounts = computed(() => activeAccounts.value.filter(isPropertyAccount));
  const accountsWithoutGroups = computed(() =>
    activeAccounts.value.filter((i) => !accountsInGroups.value[i.id] && !isVehicleAccount(i) && !isLoanAccount(i)),
  );

  const { baseCurrencyCode, sumBaseBalance } = useBaseBalanceTotals();

  // Bank Accounts total = every account rendered under the section (grouped + ungrouped).
  const bankAccountsTotal = computed(() =>
    sumBaseBalance({ accounts: [...Object.values(accountsInGroups.value), ...accountsWithoutGroups.value] }),
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
  const carsTotal = computed(() => sumBaseBalance({ accounts: vehicleAccounts.value }));
  const carsCount = computed(() => vehicleAccounts.value.length);

  // Properties total = property accounts in base currency.
  const propertiesTotal = computed(() => sumBaseBalance({ accounts: propertyAccounts.value }));
  const propertiesCount = computed(() => propertyAccounts.value.length);

  const { data: loans } = useLoans();
  const activeLoans = computed(() => partitionLoans({ loans: loans.value ?? [] }).active);
  const loansCount = computed(() => activeLoans.value.length);
  // Loans are liabilities (negative balances), so this total reads red like the loan rows.
  const loansTotal = computed(() => sumBaseBalance({ accounts: activeLoans.value }));

  const { sidebarSections } = useSidebarSections();

  const showPortfolios = computed(() => sidebarSections.value.portfolios);
  const venturesVisible = computed(() => sidebarSections.value.ventures && venturesCount.value > 0);
  const carsVisible = computed(() => sidebarSections.value.vehicles && carsCount.value > 0);
  const propertiesVisible = computed(() => sidebarSections.value.properties && propertiesCount.value > 0);
  const loansVisible = computed(() => sidebarSections.value.loans && loansCount.value > 0);

  return {
    accountGroups,
    isLoading,
    accountsWithoutGroups,
    vehicleAccounts,
    propertyAccounts,
    baseCurrencyCode,
    bankAccountsTotal,
    portfoliosTotal,
    isPortfoliosTotalLoading,
    venturesCount,
    carsTotal,
    propertiesTotal,
    loansTotal,
    showPortfolios,
    venturesVisible,
    carsVisible,
    propertiesVisible,
    loansVisible,
  };
};
