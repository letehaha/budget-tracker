import { SUBSCRIPTION_SERVICES, type SubscriptionServiceEntry } from '@/data/subscription-services';

import { createFuzzyFinder } from './fuzzy-finder';

export const findServiceByName = createFuzzyFinder<SubscriptionServiceEntry>({
  items: SUBSCRIPTION_SERVICES,
  keys: ['name', 'aliases'],
});

export function getServiceLogoUrl({ domain }: { domain: string }): string {
  const token = import.meta.env.VITE_LOGO_DEV_TOKEN;
  return `https://img.logo.dev/${domain}?token=${token}&format=png&size=64`;
}
