import type { BrandSearchResult } from '@services/brand-logos';

import { makeRequest } from './common';

export interface BrandLogoSearchResult {
  results: BrandSearchResult[];
}

// GET /api/brand-logos/search?q=... – shared brand-logo search used by the
// payee and subscription logo pickers.
export async function searchBrandLogos<R extends boolean | undefined = undefined>({
  q,
  raw,
}: {
  q?: string;
  raw?: R;
} = {}) {
  const search = new URLSearchParams();
  if (q !== undefined) search.set('q', q);
  const qs = search.toString();
  return makeRequest<BrandLogoSearchResult, R>({
    method: 'get',
    url: `/brand-logos/search${qs ? `?${qs}` : ''}`,
    raw,
  });
}
