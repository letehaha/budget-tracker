import { i18nChunkGuard } from '@/i18n/route-guard';
import type { I18nChunkName } from '@/i18n/types';
import type { RouteRecordRaw } from 'vue-router';
import { createRouter, createWebHistory } from 'vue-router';

import { ROUTES_NAMES } from './constants';
import { authPageGuard, baseCurrencyExists, redirectRouteGuard } from './guards';

export { ROUTES_NAMES } from './constants';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: ROUTES_NAMES.landing,
    component: () => import('@/pages/landing/index.vue'),
    // Landing page uses common chunk only (loaded at startup)
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
    meta: {
      // Layout chunks loaded for all dashboard pages
      i18nChunks: ['layout', 'dialogs', 'forms', 'errors'] as I18nChunkName[],
    },
    children: [
      {
        path: '/dashboard',
        name: ROUTES_NAMES.home,
        component: () => import('@/pages/dashboard/dashboard.vue'),
        meta: { i18nChunks: ['pages/dashboard'] as I18nChunkName[] },
      },
      {
        path: '/accounts',
        name: ROUTES_NAMES.accounts,
        component: () => import('@/pages/accounts/accounts.vue'),
        meta: { i18nChunks: ['pages/accounts'] as I18nChunkName[] },
      },
      {
        path: '/account/:id',
        name: ROUTES_NAMES.account,
        component: () => import('@/pages/account/account.vue'),
        meta: { i18nChunks: ['pages/account'] as I18nChunkName[] },
      },
      {
        path: '/accounts/integrations',
        name: ROUTES_NAMES.accountIntegrations,
        component: () => import('@/pages/accounts/integrations/index.vue'),
        meta: { i18nChunks: ['pages/account-integrations'] as I18nChunkName[] },
      },
      {
        path: '/accounts/integrations/:connectionId',
        name: ROUTES_NAMES.accountIntegrationDetails,
        component: () => import('@/pages/accounts/integrations/details.vue'),
        meta: { i18nChunks: ['pages/account-integrations'] as I18nChunkName[] },
      },
      {
        path: '/bank-callback',
        name: ROUTES_NAMES.bankCallback,
        component: () => import('@/pages/bank-callback.vue'),
        meta: { i18nChunks: ['pages/account-integrations'] as I18nChunkName[] },
      },
      {
        path: '/crypto',
        name: ROUTES_NAMES.crypto,
        component: () => import('@/pages/crypto/crypto.vue'),
        meta: { i18nChunks: ['pages/crypto'] as I18nChunkName[] },
      },
      {
        path: '/investments',
        name: ROUTES_NAMES.investments,
        component: () => import('@/pages/investments/investments.vue'),
        meta: { i18nChunks: ['pages/investments'] as I18nChunkName[] },
      },
      {
        path: '/portfolios/:portfolioId',
        name: ROUTES_NAMES.portfolioDetail,
        component: () => import('@/pages/portfolios/portfolio-detail.vue'),
        meta: { i18nChunks: ['pages/portfolio-detail', 'pages/investments'] as I18nChunkName[] },
      },
      {
        path: '/analytics',
        name: ROUTES_NAMES.analytics,
        component: () => import('@/pages/analytics/index.vue'),
        meta: { i18nChunks: ['pages/analytics'] as I18nChunkName[] },
        children: [
          {
            path: 'trends-comparison',
            name: ROUTES_NAMES.analyticsTrendsComparison,
            component: () => import('@/pages/analytics/subpages/annual-overview/index.vue'),
          },
          {
            path: 'cash-flow',
            name: ROUTES_NAMES.analyticsCashFlow,
            component: () => import('@/pages/analytics/subpages/cash-flow/index.vue'),
          },
        ],
      },
      {
        path: '/budgets',
        name: ROUTES_NAMES.budgets,
        component: () => import('@/pages/budgets/budgets.vue'),
        meta: { i18nChunks: ['pages/budgets'] as I18nChunkName[] },
      },
      {
        path: '/budgets/:id',
        name: ROUTES_NAMES.budgetsInfo,
        component: () => import('@/pages/budgets/budgets-info/index.vue'),
        meta: { i18nChunks: ['pages/budgets', 'pages/budget-details', 'pages/transactions'] as I18nChunkName[] },
      },
      {
        path: '/transactions',
        name: ROUTES_NAMES.transactions,
        component: () => import('@/pages/records/root.vue'),
        meta: { i18nChunks: ['pages/transactions'] as I18nChunkName[] },
      },
      {
        path: '/import/csv',
        name: ROUTES_NAMES.importCsv,
        component: () => import('@/pages/import-export/csv-import.vue'),
        meta: { i18nChunks: ['pages/import-csv'] as I18nChunkName[] },
      },
      {
        path: '/import/text-source',
        name: ROUTES_NAMES.importStatement,
        component: () => import('@/pages/import-export/statement-parser/index.vue'),
        meta: { i18nChunks: ['pages/import-statement'] as I18nChunkName[] },
      },
      {
        path: '/settings',
        name: ROUTES_NAMES.settings,
        component: () => import('@/pages/settings/settings.vue'),
        meta: {
          i18nChunks: [
            'settings/index',
            'settings/categories',
            'settings/tags',
            'settings/currencies',
            'settings/accounts-groups',
            'settings/data-management',
            'settings/preferences',
            'settings/ai',
            'settings/security',
            'settings/admin',
          ] as I18nChunkName[],
        },
        children: [
          {
            path: 'categories',
            name: ROUTES_NAMES.settingsCategories,
            component: () => import('@/pages/settings/subpages/categories/index.vue'),
            meta: { i18nChunks: ['settings/categories'] as I18nChunkName[] },
          },
          {
            path: 'tags',
            name: ROUTES_NAMES.settingsTags,
            component: () => import('@/pages/settings/subpages/tags/index.vue'),
            meta: { i18nChunks: ['settings/tags'] as I18nChunkName[] },
          },
          {
            path: 'currencies',
            name: ROUTES_NAMES.settingsCurrencies,
            component: () => import('@/pages/settings/subpages/currencies/index.vue'),
            meta: { i18nChunks: ['settings/currencies'] as I18nChunkName[] },
          },
          {
            path: 'accounts',
            name: ROUTES_NAMES.settingsAccounts,
            component: () => import('@/pages/settings/subpages/accounts-groups/index.vue'),
            meta: { i18nChunks: ['settings/accounts-groups'] as I18nChunkName[] },
          },
          {
            path: 'data-management',
            name: ROUTES_NAMES.settingsDataManagement,
            component: () => import('@/pages/settings/subpages/data-management/index.vue'),
            meta: { i18nChunks: ['settings/data-management'] as I18nChunkName[] },
          },
          {
            path: 'preferences',
            name: ROUTES_NAMES.settingsPreferences,
            component: () => import('@/pages/settings/subpages/preferences/index.vue'),
            meta: { i18nChunks: ['settings/preferences'] as I18nChunkName[] },
          },
          {
            path: 'admin',
            name: ROUTES_NAMES.settingsAdmin,
            component: () => import('@/pages/settings/subpages/admin/index.vue'),
            meta: { i18nChunks: ['settings/admin'] as I18nChunkName[] },
          },
          {
            path: 'ai',
            name: ROUTES_NAMES.settingsAi,
            component: () => import('@/pages/settings/subpages/ai/index.vue'),
            redirect: { name: ROUTES_NAMES.settingsAiFeatures },
            meta: { i18nChunks: ['settings/ai'] as I18nChunkName[] },
            children: [
              {
                path: 'features',
                name: ROUTES_NAMES.settingsAiFeatures,
                component: () => import('@/pages/settings/subpages/ai/pages/features.vue'),
              },
              {
                path: 'keys',
                name: ROUTES_NAMES.settingsAiKeys,
                component: () => import('@/pages/settings/subpages/ai/pages/keys.vue'),
              },
            ],
          },
          {
            path: 'security',
            name: ROUTES_NAMES.settingsSecurity,
            component: () => import('@/pages/settings/subpages/security/index.vue'),
            meta: { i18nChunks: ['settings/security'] as I18nChunkName[] },
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
        meta: { i18nChunks: ['auth/sign-in'] as I18nChunkName[] },
      },
      {
        path: '/sign-up',
        name: ROUTES_NAMES.signUp,
        beforeEnter: authPageGuard,
        component: () => import('@/pages/auth/register.vue'),
        meta: { i18nChunks: ['auth/sign-up'] as I18nChunkName[] },
      },
      {
        path: '/verify-email',
        name: ROUTES_NAMES.verifyEmail,
        component: () => import('@/pages/auth/verify-email.vue'),
        meta: { i18nChunks: ['auth/verify-email'] as I18nChunkName[] },
      },
      {
        path: '/auth/verify-legacy-email',
        name: ROUTES_NAMES.verifyLegacyEmail,
        component: () => import('@/pages/auth/verify-legacy-email.vue'),
        meta: { i18nChunks: ['auth/verify-email'] as I18nChunkName[] },
      },
      {
        path: '/welcome',
        name: ROUTES_NAMES.welcome,
        beforeEnter: redirectRouteGuard,
        component: () => import('@/pages/auth/welcome.vue'),
        meta: { i18nChunks: ['auth/welcome'] as I18nChunkName[] },
      },
      {
        path: '/auth/callback',
        name: ROUTES_NAMES.authCallback,
        component: () => import('@/pages/auth/oauth-callback.vue'),
        meta: { i18nChunks: ['auth/welcome'] as I18nChunkName[] },
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

// Register global i18n chunk loading guard
router.beforeResolve(i18nChunkGuard);
