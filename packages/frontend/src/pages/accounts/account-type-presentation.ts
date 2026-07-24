import { ACCOUNT_CATEGORIES } from '@bt/shared/types';
import {
  BanknoteIcon,
  BitcoinIcon,
  CarIcon,
  CreditCardIcon,
  GiftIcon,
  HandCoinsIcon,
  LandmarkIcon,
  PiggyBankIcon,
  ShieldIcon,
  TrendingUpIcon,
  WalletIcon,
} from '@lucide/vue';
import type { Component } from 'vue';

/**
 * Single source for per-account-category icon and chip color so account list rows don't drift apart.
 * Color comes from the `--account-<color>` design tokens (see `global.css`) bridged to Tailwind as
 * `bg-account-<color>` / `text-account-<color>`, applied as a soft tinted square behind the row icon.
 */

const ACCOUNT_CATEGORY_ICONS: Record<ACCOUNT_CATEGORIES, Component> = {
  [ACCOUNT_CATEGORIES.currentAccount]: LandmarkIcon,
  [ACCOUNT_CATEGORIES.general]: WalletIcon,
  [ACCOUNT_CATEGORIES.bonus]: GiftIcon,
  [ACCOUNT_CATEGORIES.insurance]: ShieldIcon,
  [ACCOUNT_CATEGORIES.saving]: PiggyBankIcon,
  [ACCOUNT_CATEGORIES.creditCard]: CreditCardIcon,
  [ACCOUNT_CATEGORIES.overdraft]: CreditCardIcon,
  [ACCOUNT_CATEGORIES.cash]: BanknoteIcon,
  [ACCOUNT_CATEGORIES.investment]: TrendingUpIcon,
  [ACCOUNT_CATEGORIES.crypto]: BitcoinIcon,
  [ACCOUNT_CATEGORIES.vehicle]: CarIcon,
  [ACCOUNT_CATEGORIES.loan]: HandCoinsIcon,
};

/**
 * Soft tinted square behind the account-category icon in list rows. Each branch is a full static
 * literal so Tailwind's scanner picks the classes up — never build these by string interpolation.
 */
const ACCOUNT_CATEGORY_TINTED_CHIP_CLASSES: Record<ACCOUNT_CATEGORIES, string> = {
  [ACCOUNT_CATEGORIES.currentAccount]: 'bg-account-checking/15 text-account-checking',
  [ACCOUNT_CATEGORIES.general]: 'bg-account-checking/15 text-account-checking',
  [ACCOUNT_CATEGORIES.bonus]: 'bg-account-checking/15 text-account-checking',
  [ACCOUNT_CATEGORIES.insurance]: 'bg-account-checking/15 text-account-checking',
  [ACCOUNT_CATEGORIES.saving]: 'bg-account-saving/15 text-account-saving',
  [ACCOUNT_CATEGORIES.creditCard]: 'bg-account-credit/15 text-account-credit',
  [ACCOUNT_CATEGORIES.overdraft]: 'bg-account-credit/15 text-account-credit',
  [ACCOUNT_CATEGORIES.cash]: 'bg-account-cash/15 text-account-cash',
  [ACCOUNT_CATEGORIES.investment]: 'bg-account-investment/15 text-account-investment',
  [ACCOUNT_CATEGORIES.crypto]: 'bg-account-crypto/15 text-account-crypto',
  [ACCOUNT_CATEGORIES.vehicle]: 'bg-account-vehicle/15 text-account-vehicle',
  [ACCOUNT_CATEGORIES.loan]: 'bg-account-checking/15 text-account-checking',
};

// Fall back to `general` so an unrecognized category (e.g. new server-side value) still renders.
export const getAccountTypeIcon = ({ category }: { category: ACCOUNT_CATEGORIES }): Component =>
  ACCOUNT_CATEGORY_ICONS[category] ?? ACCOUNT_CATEGORY_ICONS[ACCOUNT_CATEGORIES.general];

export const getAccountTypeTintedChipClass = ({ category }: { category: ACCOUNT_CATEGORIES }): string =>
  ACCOUNT_CATEGORY_TINTED_CHIP_CLASSES[category] ?? ACCOUNT_CATEGORY_TINTED_CHIP_CLASSES[ACCOUNT_CATEGORIES.general];
