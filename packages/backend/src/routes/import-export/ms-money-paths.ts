import { API_PREFIX } from '@root/config';

// setup-routes.ts mounts ms-money.route.ts here.
const IMPORT_ROUTER_PREFIX = `${API_PREFIX}/import`;

// Router-relative paths, as passed to `router.post` / `router.get`.
export const MS_MONEY_ROUTE_PATHS = {
  upload: '/ms-money/upload',
  detectDuplicates: '/ms-money/detect-duplicates',
  execute: '/ms-money/execute',
  status: '/ms-money/status/:jobId',
} as const;

// Full `req.path` values, for the body-parser rules in setup-middleware.ts that
// run before route mounting and so never see the router-relative form.
export const MS_MONEY_FULL_PATHS = {
  upload: `${IMPORT_ROUTER_PREFIX}${MS_MONEY_ROUTE_PATHS.upload}`,
  detectDuplicates: `${IMPORT_ROUTER_PREFIX}${MS_MONEY_ROUTE_PATHS.detectDuplicates}`,
  execute: `${IMPORT_ROUTER_PREFIX}${MS_MONEY_ROUTE_PATHS.execute}`,
} as const;
