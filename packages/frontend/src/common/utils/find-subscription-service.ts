import { SUBSCRIPTION_SERVICES, type SubscriptionServiceEntry } from '@/data/subscription-services';
import Fuse from 'fuse.js';

const fuse = new Fuse(SUBSCRIPTION_SERVICES, {
  keys: ['name', 'aliases'],
  threshold: 0.3,
  includeScore: true,
});

export function findServiceByName({ name }: { name: string }): SubscriptionServiceEntry | null {
  if (!name.trim()) return null;

  const results = fuse.search(name);
  if (!results.length) return null;

  const best = results[0]!;
  if (best.score !== undefined && best.score > 0.3) return null;

  return best.item;
}

export function getServiceLogoUrl({ domain }: { domain: string }): string {
  const token = import.meta.env.VITE_LOGO_DEV_TOKEN;
  return `https://img.logo.dev/${domain}?token=${token}&format=png&size=64`;
}
