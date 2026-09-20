import { ROUTES_NAMES } from '@/routes/constants';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

/** Which top-level nav group the current route belongs to, shared by the full nav and the rail. */
export const useSidebarNavRoutes = () => {
  const route = useRoute();

  const isAccountsRoute = computed(
    () =>
      route.name === ROUTES_NAMES.accounts ||
      route.name === ROUTES_NAMES.account ||
      route.name === ROUTES_NAMES.accountIntegrationDetails ||
      route.name === ROUTES_NAMES.loans ||
      route.name === ROUTES_NAMES.loanDetail ||
      route.name === ROUTES_NAMES.investments ||
      route.name === ROUTES_NAMES.portfolioDetail ||
      route.name === ROUTES_NAMES.portfolioTransactionsImport ||
      route.name === ROUTES_NAMES.venture ||
      route.name === ROUTES_NAMES.venturePlatformsList ||
      route.name === ROUTES_NAMES.ventureDealDetail,
  );

  const isTransactionsRoute = computed(
    () =>
      route.name === ROUTES_NAMES.transactions ||
      route.name === ROUTES_NAMES.transactionGroups ||
      route.name === ROUTES_NAMES.optimizations ||
      route.name === ROUTES_NAMES.optimizationsTransfers ||
      route.name === ROUTES_NAMES.optimizationsAiCategorization ||
      route.name === ROUTES_NAMES.automations ||
      route.name === ROUTES_NAMES.automationCreate ||
      route.name === ROUTES_NAMES.automationDetails,
  );

  const isPlannedRoute = computed(
    () =>
      route.name === ROUTES_NAMES.planned ||
      route.name === ROUTES_NAMES.plannedSubscriptions ||
      route.name === ROUTES_NAMES.plannedSubscriptionDetails ||
      route.name === ROUTES_NAMES.plannedBudgets ||
      route.name === ROUTES_NAMES.plannedBudgetDetails,
  );

  return { isAccountsRoute, isTransactionsRoute, isPlannedRoute };
};
