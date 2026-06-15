import { EnvVar, isEnvConfigured } from '@common/utils/env';
import { logger } from '@js/utils/logger';
import { withRetry } from '@js/utils/requests-calling.utils';

const LOGO_DEV_SEARCH_URL = 'https://api.logo.dev/search';
/** logo.dev returns at most 10 results per search. */
const LOGO_DEV_REQUEST_TIMEOUT_MS = 5_000;

// logo.dev response shape per-item
interface LogoDevResult {
  name: string;
  domain: string;
  logo_url: string | null;
}

export interface BrandSearchResult {
  name: string;
  domain: string;
  logoUrl: string | null;
}

// Warn once across the process lifetime so the log doesn't spam on every call.
let unconfiguredWarningEmitted = false;

/**
 * Search the logo.dev Brand Search API for brands matching `query`.
 *
 * Returns an empty array when:
 * - `LOGO_DEV_SECRET_KEY` is not configured (logs a one-time warning instead
 *   of throwing, so environments without the key keep working normally).
 * - The API returns no results.
 * - The response is malformed.
 *
 * Never throws on empty / no-result responses — only propagates after all
 * `withRetry` attempts have been exhausted on genuine network/server errors.
 */
export async function searchBrands({ query }: { query: string }): Promise<BrandSearchResult[]> {
  const secretKey = process.env.LOGO_DEV_SECRET_KEY;

  if (!isEnvConfigured(EnvVar.LOGO_DEV_SECRET_KEY, secretKey)) {
    if (!unconfiguredWarningEmitted) {
      logger.warn(
        '[logo-provider] LOGO_DEV_SECRET_KEY is not configured. ' +
          'Brand-logo search will return empty results. ' +
          'Set LOGO_DEV_SECRET_KEY in your environment to enable this feature.',
      );
      unconfiguredWarningEmitted = true;
    }
    return [];
  }

  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = `${LOGO_DEV_SEARCH_URL}?q=${encodeURIComponent(trimmed)}`;

  const rawItems = await withRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), LOGO_DEV_REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`logo.dev search returned HTTP ${response.status} for query "${trimmed}"`);
        }

        const data: unknown = await response.json();

        if (!Array.isArray(data)) {
          logger.warn(`[logo-provider] Unexpected response shape from logo.dev for query "${trimmed}"`);
          return [] as LogoDevResult[];
        }

        return data as LogoDevResult[];
      } finally {
        clearTimeout(timeoutId);
      }
    },
    {
      maxRetries: 2,
      delay: 500,
      onError(error, attempt) {
        // Abort (timeout) and 4xx errors are not worth retrying.
        if (error instanceof Error) {
          if (error.name === 'AbortError') return false;
          if (error.message.includes('HTTP 4')) return false;
        }
        logger.warn(`[logo-provider] Search attempt ${attempt + 1} failed for "${trimmed}": ${String(error)}`);
        return true;
      },
    },
  );

  if (!rawItems || rawItems.length === 0) return [];

  return rawItems
    .filter(
      (item): item is LogoDevResult => item != null && typeof item.name === 'string' && typeof item.domain === 'string',
    )
    .map((item) => ({
      name: item.name,
      domain: item.domain,
      logoUrl: item.logo_url ?? null,
    }));
}
