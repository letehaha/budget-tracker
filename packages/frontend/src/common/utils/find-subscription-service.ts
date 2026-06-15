import { SUBSCRIPTION_SERVICES, type SubscriptionServiceEntry } from '@/data/subscription-services';

import { createFuzzyFinder } from './fuzzy-finder';

// Generic logo.dev URL builder lives in a feature-neutral util. Re-exported
// here for the subscription/bank callers that import it alongside
// `findServiceByName`.
export { getServiceLogoUrl } from './logo-url';

export const findServiceByName = createFuzzyFinder<SubscriptionServiceEntry>({
  items: SUBSCRIPTION_SERVICES,
  keys: ['name', 'aliases'],
});
