import { api } from '@/api/_api';

export interface BrandLogoSearchResult {
  name: string;
  domain: string;
  logoUrl: string | null;
}

/**
 * Shared brand-logo search backing the manual logo picker for every entity
 * (payees, subscriptions). Proxies the logo.dev Brand Search API on the backend.
 */
export const searchBrandLogo = async ({ q }: { q: string }): Promise<{ results: BrandLogoSearchResult[] }> => {
  return api.get(`/brand-logos/search?q=${encodeURIComponent(q)}`);
};
