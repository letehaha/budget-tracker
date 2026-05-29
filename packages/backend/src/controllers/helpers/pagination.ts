import { z } from 'zod';

/**
 * Standard pagination query fields. Spread into a `z.object({...})` alongside
 * route-specific filters, then pass the resulting schema through
 * `.transform(applyPaginationTransform)` to fold `page` into `offset`.
 */
export const paginationFields = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  page: z.coerce.number().int().min(1).optional(),
};

type PaginationShape = { limit: number; offset: number; page?: number };

export const applyPaginationTransform = <T extends PaginationShape>(data: T): T => {
  if (data.page !== undefined) {
    data.offset = (data.page - 1) * data.limit;
  }
  return data;
};

/**
 * Canonical pagination response block written by every list controller. Pass
 * the validated query (which carries `limit`, `offset`, `page`) plus any extra
 * fields (e.g. `totalCount`) the service exposes.
 */
export const buildPagination = <Extra extends Record<string, unknown>>(query: PaginationShape, extra?: Extra) => ({
  limit: query.limit,
  offset: query.offset,
  page: query.page || Math.floor(query.offset / query.limit) + 1,
  ...extra,
});
