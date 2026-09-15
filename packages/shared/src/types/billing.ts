export const PLANS = {
  essential: 'essential',
  plus: 'plus',
  early_adopter: 'early_adopter',
} as const;
export type Plan = (typeof PLANS)[keyof typeof PLANS];

/** Plans that can be bought. `early_adopter` is granted by hand, never sold. */
export type BillingTier = Exclude<Plan, typeof PLANS.early_adopter>;
export const BILLING_TIERS = [PLANS.essential, PLANS.plus] as const satisfies readonly BillingTier[];

export const BILLING_CYCLES = { month: 'month', year: 'year' } as const;
export type BillingCycle = (typeof BILLING_CYCLES)[keyof typeof BILLING_CYCLES];

export const SUBSCRIPTION_STATUSES = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  paused: 'paused',
  canceled: 'canceled',
} as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];

/** Statuses that still grant access while `currentPeriodEndsAt` is in the future. */
const ENTITLED_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  SUBSCRIPTION_STATUSES.active,
  SUBSCRIPTION_STATUSES.trialing,
  SUBSCRIPTION_STATUSES.past_due,
];

/** A mirrored subscription never leaves `canceled`: it will never charge again and Stripe rejects mutating it. */
export const TERMINAL_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [SUBSCRIPTION_STATUSES.canceled];

export const isTerminalSubscription = ({ status }: { status: SubscriptionStatus }): boolean =>
  TERMINAL_SUBSCRIPTION_STATUSES.includes(status);

/** Raw Stripe statuses that all mirror as `canceled`. For call sites reading a Stripe object directly. */
export const STRIPE_TERMINAL_STATUSES: readonly string[] = ['canceled', 'unpaid', 'incomplete', 'incomplete_expired'];

export const isTerminalStripeStatus = ({ status }: { status: string }): boolean =>
  STRIPE_TERMINAL_STATUSES.includes(status);

export const FEATURES = {
  bank_providers: 'bank_providers',
  operator_ai: 'operator_ai',
  backup_export: 'backup_export',
  backup_restore: 'backup_restore',
  data_export: 'data_export',
} as const;
export type Feature = (typeof FEATURES)[keyof typeof FEATURES];

const ESSENTIAL_FEATURES: readonly Feature[] = [FEATURES.backup_export, FEATURES.backup_restore, FEATURES.data_export];
const PLUS_FEATURES: readonly Feature[] = [...ESSENTIAL_FEATURES, FEATURES.bank_providers, FEATURES.operator_ai];
/** Plus as of launch (2026-09-15). Deliberately not a reference to PLUS_FEATURES: features added later are paid for early adopters. */
const EARLY_ADOPTER_FEATURES: readonly Feature[] = [
  ...ESSENTIAL_FEATURES,
  FEATURES.bank_providers,
  FEATURES.operator_ai,
];

/**
 * Gates check `features.includes(x)`, never `plan === 'plus'`, so limiting
 * early adopters later is a one-line edit here.
 */
export const PLAN_FEATURES: Record<Plan, readonly Feature[]> = {
  essential: ESSENTIAL_FEATURES,
  plus: PLUS_FEATURES,
  early_adopter: EARLY_ADOPTER_FEATURES,
};

export const SEATS_BY_PLAN: Record<Plan, number> = {
  essential: 2,
  plus: 5,
  early_adopter: 5,
};

export const TRIAL_EXCLUDED_FEATURES: readonly Feature[] = [
  FEATURES.backup_export,
  FEATURES.backup_restore,
  FEATURES.data_export,
];

export const TRIAL_DAYS = 40;

export interface ScheduledChange {
  action: 'cancel' | 'resume';
  effectiveAt: string;
}

export interface BillingSubscriptionSummary {
  externalSubscriptionId: string;
  tier: BillingTier;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  currentPeriodEndsAt: string;
  scheduledChange: ScheduledChange | null;
}

export interface Entitlements {
  features: readonly Feature[];
  readOnly: boolean;
  seats: number;
  /** Non-null means a lifetime grant of that plan. */
  plan: Plan | null;
  trialEndsAt: string | null;
  subscriptions: BillingSubscriptionSummary[];
}

/** Access continues while the status is entitled and the paid period has not elapsed. */
export const isEntitledSubscription = ({
  status,
  currentPeriodEndsAt,
  now = Date.now(),
}: {
  status: SubscriptionStatus;
  currentPeriodEndsAt: Date | string;
  now?: number;
}): boolean => ENTITLED_SUBSCRIPTION_STATUSES.includes(status) && new Date(currentPeriodEndsAt).getTime() > now;

export type StripeEnvironment = 'test' | 'live';

/**
 * Stripe price ids are per-mode: a `price_` minted in test mode does not resolve
 * in live mode. Checkout is opened with them, and the subscription webhook
 * reverse-maps them to a tier.
 */
export const STRIPE_PRICE_IDS: Record<StripeEnvironment, Record<BillingTier, Record<BillingCycle, string>>> = {
  test: {
    essential: {
      month: 'price_1UFEyOCr9EksbtoDs07fbGbC',
      year: 'price_1UFFVbCr9EksbtoD5iKVymgZ',
    },
    plus: {
      month: 'price_1UFFVcCr9EksbtoDQ5DGIZwT',
      year: 'price_1UFFVcCr9EksbtoD8Se3s8YZ',
    },
  },
  live: {
    essential: {
      month: 'price_1UFwoOCbCW2ZJsWzt8NATzaF',
      year: 'price_1UFwoOCbCW2ZJsWzaulBTaX7',
    },
    plus: {
      month: 'price_1UFwoKCbCW2ZJsWzW9eLs06J',
      year: 'price_1UFwoKCbCW2ZJsWzuJ2Slpz2',
    },
  },
};

export const resolveTierByPriceId = ({
  env,
  priceId,
}: {
  env: StripeEnvironment;
  priceId: string;
}): { tier: BillingTier; billingCycle: BillingCycle } | null => {
  if (!priceId) return null;
  for (const tier of BILLING_TIERS) {
    for (const billingCycle of Object.values(BILLING_CYCLES)) {
      if (STRIPE_PRICE_IDS[env][tier][billingCycle] === priceId) return { tier, billingCycle };
    }
  }
  return null;
};
