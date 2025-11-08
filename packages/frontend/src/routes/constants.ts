const ROUTER_LAYOUTS = Object.freeze({
  auth: 'auth',
  dashboard: 'dashboard',
});

export const ROUTES_NAMES = Object.freeze({
  dashboard: ROUTER_LAYOUTS.dashboard,
  home: `${ROUTER_LAYOUTS.dashboard}.home`,
  accounts: `${ROUTER_LAYOUTS.dashboard}.accounts`,
  account: `${ROUTER_LAYOUTS.dashboard}.account`,
  createAccount: `${ROUTER_LAYOUTS.dashboard}.create-account`,
  accountIntegrations: `${ROUTER_LAYOUTS.dashboard}.account-integrations`,
  accountIntegrationDetails: `${ROUTER_LAYOUTS.dashboard}.account-integration-details`,
  accountIntegrationsConnect: `${ROUTER_LAYOUTS.dashboard}.account-integrations-connect`,
  budgets: `${ROUTER_LAYOUTS.dashboard}.budgets`,
  budgetsInfo: `${ROUTER_LAYOUTS.dashboard}.budgets.info`,
  crypto: `${ROUTER_LAYOUTS.dashboard}.crypto`,
  analytics: `${ROUTER_LAYOUTS.dashboard}.analytics`,
  investments: `${ROUTER_LAYOUTS.dashboard}.investments`,
  investmentAccount: `${ROUTER_LAYOUTS.dashboard}.investment-account`,
  portfolioDetail: `${ROUTER_LAYOUTS.dashboard}.portfolio-detail`,
  transactions: `${ROUTER_LAYOUTS.dashboard}.transactions`,
  settings: `${ROUTER_LAYOUTS.dashboard}.settings`,
  settingsCurrencies: `${ROUTER_LAYOUTS.dashboard}.settings.currencies`,
  settingsCategories: `${ROUTER_LAYOUTS.dashboard}.settings.categories`,
  settingsAccounts: `${ROUTER_LAYOUTS.dashboard}.settings.accounts-groups`,
  settingsIntegrations: `${ROUTER_LAYOUTS.dashboard}.settings.integrations`,
  settingsAdmin: `${ROUTER_LAYOUTS.dashboard}.settings.admin`,

  auth: ROUTER_LAYOUTS.auth,
  signIn: `${ROUTER_LAYOUTS.auth}.sign-in`,
  signUp: `${ROUTER_LAYOUTS.auth}.sign-up`,
  welcome: `${ROUTER_LAYOUTS.auth}.welcome`,
});
