import { SUBSCRIPTION_SERVICES, type SubscriptionServiceEntry } from '@/data/subscription-services';

import { createFuzzyFinder } from './fuzzy-finder';

export const findServiceByName = createFuzzyFinder<SubscriptionServiceEntry>({
  items: SUBSCRIPTION_SERVICES,
  keys: ['name', 'aliases'],
});

export function getServiceLogoUrl({ domain }: { domain: string }): string | null {
  const token = import.meta.env.VITE_LOGO_DEV_TOKEN;
  // Without a token logo.dev returns 401 — better to skip the request entirely
  // than render an <img> that 401s for every visible subscription/bank logo.
  if (!token) return null;
  return `https://img.logo.dev/${domain}?token=${token}&format=png&size=64`;
}
