import { loadUserData } from '@/api';
import { isBillingEnabled, liveSubscription } from '@/common/const/billing';
import { SUBSCRIPTION_STATUSES, USER_ROLES, UserModel, isTerminalSubscription, type Feature } from '@bt/shared/types';
import { differenceInCalendarDays } from 'date-fns';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useUserStore = defineStore('user', () => {
  const user = ref<UserModel | null>(null);
  const isUserExists = computed(() => Boolean(user.value));
  const isDemo = computed(() => user.value?.role === USER_ROLES.demo);
  const role = computed(() => user.value?.role ?? null);
  const canSeeBilling = computed(() => isBillingEnabled() && !isDemo.value);

  const entitlements = computed(() => user.value?.entitlements ?? null);

  const hasFeature = (feature: Feature): boolean => Boolean(entitlements.value?.features.includes(feature));

  // Demo sessions carry their own restriction tooltips, and a null entitlements means the
  // user request is still in flight — neither is a denial.
  const isFeatureGated = (feature: Feature): boolean =>
    !isDemo.value && entitlements.value !== null && !hasFeature(feature);

  const isReadOnly = computed(() => Boolean(entitlements.value?.readOnly));

  const hasSubscriptions = computed(() => Boolean(entitlements.value?.subscriptions.length));

  const isPastDue = computed(
    () => liveSubscription({ entitlements: entitlements.value })?.status === SUBSCRIPTION_STATUSES.past_due,
  );

  const trialDaysLeft = computed<number | null>(() => {
    const value = entitlements.value;
    if (!value?.trialEndsAt || value.plan) return null;
    // A churned user is back on whatever is left of the trial, so only a live row suppresses it.
    if (value.subscriptions.some((s) => !isTerminalSubscription(s))) return null;

    return Math.max(0, differenceInCalendarDays(new Date(value.trialEndsAt), new Date()));
  });

  const loadUser = async () => {
    user.value = await loadUserData();
  };

  return {
    user,
    isUserExists,
    isDemo,
    role,
    canSeeBilling,
    entitlements,
    hasFeature,
    isFeatureGated,
    isReadOnly,
    isPastDue,
    hasSubscriptions,
    trialDaysLeft,
    loadUser,
  };
});
