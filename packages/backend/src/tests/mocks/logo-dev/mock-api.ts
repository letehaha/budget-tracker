import type { BrandSearchResult } from '@services/brand-logos';
import { HttpResponse, http } from 'msw';

export const LOGO_DEV_SEARCH_URL_REGEX = /api\.logo\.dev\/search/;

/**
 * Default logo.dev search handler: returns an empty array.
 * Tests that want specific results call `global.mswMockServer.use(getLogoDevSearchMock(...))` to
 * override this handler for the duration of that test.
 */
export const logoDevHandlers = [
  http.get(LOGO_DEV_SEARCH_URL_REGEX, () => {
    return HttpResponse.json([]);
  }),
];

/**
 * Build a one-shot or persistent MSW override for the logo.dev search endpoint that
 * returns the provided brand results.
 *
 * Usage in a test:
 *   global.mswMockServer.use(getLogoDevSearchMock({ results: [...] }));
 */
export const getLogoDevSearchMock = ({
  results = [],
  status = 200,
}: {
  results?: BrandSearchResult[];
  status?: number;
} = {}) => {
  // logo.dev returns snake_case `logo_url`, so translate back from the already-mapped shape
  const rawItems = results.map((r) => ({
    name: r.name,
    domain: r.domain,
    logo_url: r.logoUrl,
  }));

  return http.get(LOGO_DEV_SEARCH_URL_REGEX, () => {
    if (status !== 200) {
      return new HttpResponse(null, { status });
    }
    return HttpResponse.json(rawItems);
  });
};
