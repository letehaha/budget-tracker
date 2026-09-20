import { ROUTES_NAMES } from '@/routes/constants';
import {
  CreditCardIcon,
  GroupIcon,
  HandCoinsIcon,
  RepeatIcon,
  RocketIcon,
  TrendingUpIcon,
  WalletIcon,
  WrenchIcon,
  ZapIcon,
} from '@lucide/vue';
import type { Component } from 'vue';

export interface SidebarNavChild {
  routeName: string;
  labelKey: string;
  icon: Component;
}

/** Sub-links of the collapsible nav groups, rendered by both the full nav and the rail flyouts. */
export const SIDEBAR_NAV_CHILDREN = {
  accounts: [
    { routeName: ROUTES_NAMES.accounts, labelKey: 'navigation.accountsList', icon: WalletIcon },
    { routeName: ROUTES_NAMES.loans, labelKey: 'navigation.loans', icon: HandCoinsIcon },
    { routeName: ROUTES_NAMES.investments, labelKey: 'navigation.investments', icon: TrendingUpIcon },
    { routeName: ROUTES_NAMES.venture, labelKey: 'navigation.venture', icon: RocketIcon },
  ],
  transactions: [
    { routeName: ROUTES_NAMES.transactions, labelKey: 'navigation.allTransactions', icon: CreditCardIcon },
    { routeName: ROUTES_NAMES.transactionGroups, labelKey: 'navigation.transactionGroups', icon: GroupIcon },
    { routeName: ROUTES_NAMES.optimizations, labelKey: 'navigation.optimizations', icon: WrenchIcon },
    { routeName: ROUTES_NAMES.automations, labelKey: 'navigation.automations', icon: ZapIcon },
  ],
  planned: [
    { routeName: ROUTES_NAMES.plannedSubscriptions, labelKey: 'navigation.planned.subscriptions', icon: RepeatIcon },
    { routeName: ROUTES_NAMES.plannedBudgets, labelKey: 'navigation.planned.budgets', icon: WalletIcon },
  ],
} satisfies Record<string, SidebarNavChild[]>;
