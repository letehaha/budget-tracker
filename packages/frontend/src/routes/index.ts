import { createRouter, createWebHistory } from 'vue-router';

import { ROUTES_NAMES } from './constants';
import { authPageGuard, baseCurrencyExists, devOnly, redirectRouteGuard } from './guards';

export { ROUTES_NAMES } from './constants';

const routes = [
  {
    path: '/',
    name: ROUTES_NAMES.landing,
    component: () => import('@/pages/landing/index.vue'),
  },
  {
    path: '/privacy-policy',
    name: ROUTES_NAMES.privacyPolicy,
    component: () => import('@/pages/legal/privacy-policy.vue'),
  },
  {
    path: '/terms-of-use',
    name: ROUTES_NAMES.termsOfUse,
    component: () => import('@/pages/legal/terms-of-use.vue'),
  },
  {
    path: '/app',
    name: ROUTES_NAMES.dashboard,
    component: () => import('@/layouts/dashboard.vue'),
    beforeEnter: [redirectRouteGuard, baseCurrencyExists],
    redirect: () => ({ name: ROUTES_NAMES.home }),
    children: [
      {
        path: '/dashboard',
        name: ROUTES_NAMES.home,
        component: () => import('@/pages/dashboard/dashboard.vue'),
      },
      {
        path: '/accounts',
        name: ROUTES_NAMES.accounts,
        component: () => import('@/pages/accounts/accounts.vue'),
      },
      {
        path: '/account/:id',
        name: ROUTES_NAMES.account,
        component: () => import('@/pages/account/account.vue'),
      },
      {
        path: '/accounts/integrations',
        name: ROUTES_NAMES.accountIntegrations,
        component: () => import('@/pages/accounts/integrations/index.vue'),
      },
      {
        path: '/accounts/integrations/:connectionId',
        name: ROUTES_NAMES.accountIntegrationDetails,
        component: () => import('@/pages/accounts/integrations/details.vue'),
      },
      {
        path: '/bank-callback',
        name: ROUTES_NAMES.bankCallback,
        component: () => import('@/pages/bank-callback.vue'),
      },
      {
        path: '/crypto',
        name: ROUTES_NAMES.crypto,
        component: () => import('@/pages/crypto/crypto.vue'),
      },
      {
        path: '/investments',
        name: ROUTES_NAMES.investments,
        component: () => import('@/pages/investments/investments.vue'),
      },
      {
        path: '/portfolios/:portfolioId',
        name: ROUTES_NAMES.portfolioDetail,
        component: () => import('@/pages/portfolios/portfolio-detail.vue'),
      },
      {
        path: '/analytics',
        name: ROUTES_NAMES.analytics,
        beforeEnter: [devOnly],
        component: () => import('@/pages/analytics/index.vue'),
      },
      {
        path: '/budgets',
        name: ROUTES_NAMES.budgets,
        component: () => import('@/pages/budgets/budgets.vue'),
      },
      {
        path: '/budgets/:id',
        name: ROUTES_NAMES.budgetsInfo,
        component: () => import('@/pages/budgets/budgets-info/index.vue'),
      },
      {
        path: '/transactions',
        name: ROUTES_NAMES.transactions,
        component: () => import('@/pages/records/root.vue'),
      },
      {
        path: '/import/csv',
        name: ROUTES_NAMES.importCsv,
        component: () => import('@/pages/import-export/csv-import.vue'),
      },
      {
        path: '/import/text-source',
        name: ROUTES_NAMES.importStatement,
        component: () => import('@/pages/import-export/statement-parser/index.vue'),
      },
      {
        path: '/settings',
        name: ROUTES_NAMES.settings,
        component: () => import('@/pages/settings/settings.vue'),
        children: [
          {
            path: 'categories',
            name: ROUTES_NAMES.settingsCategories,
            component: () => import('@/pages/settings/subpages/categories/index.vue'),
          },
          {
            path: 'currencies',
            name: ROUTES_NAMES.settingsCurrencies,
            component: () => import('@/pages/settings/subpages/currencies/index.vue'),
          },
          {
            path: 'accounts',
            name: ROUTES_NAMES.settingsAccounts,
            component: () => import('@/pages/settings/subpages/accounts-groups/index.vue'),
          },
          {
            path: 'data-management',
            name: ROUTES_NAMES.settingsDataManagement,
            component: () => import('@/pages/settings/subpages/data-management/index.vue'),
          },
          {
            path: 'admin',
            name: ROUTES_NAMES.settingsAdmin,
            component: () => import('@/pages/settings/subpages/admin/index.vue'),
          },
          {
            path: 'ai',
            name: ROUTES_NAMES.settingsAi,
            component: () => import('@/pages/settings/subpages/ai/index.vue'),
          },
        ],
      },
    ],
  },
  {
    path: '/auth',
    name: ROUTES_NAMES.auth,
    component: () => import('@/layouts/auth.vue'),
    redirect: () => ({ name: ROUTES_NAMES.signIn }),
    children: [
      {
        path: '/sign-in',
        name: ROUTES_NAMES.signIn,
        beforeEnter: authPageGuard,
        component: () => import('@/pages/auth/login.vue'),
      },
      {
        path: '/sign-up',
        name: ROUTES_NAMES.signUp,
        beforeEnter: authPageGuard,
        component: () => import('@/pages/auth/register.vue'),
      },
      {
        path: '/welcome',
        name: ROUTES_NAMES.welcome,
        beforeEnter: redirectRouteGuard,
        component: () => import('@/pages/auth/welcome.vue'),
      },
    ],
  },
  // TODO: how to deal better
  // {
  //   path: '/:pathMatch(.*)',
  //   redirect: '/',
  // },
];

export const router = createRouter({
  history: createWebHistory(),
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore dunno why but TS is stupidly angry here for now reason, after
  // adding nested routes for settings
  routes,
});
