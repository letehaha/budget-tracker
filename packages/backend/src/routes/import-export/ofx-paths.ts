import { API_PREFIX } from '@root/config';

const IMPORT_ROUTER_PREFIX = `${API_PREFIX}/import`;

export const OFX_ROUTE_PATHS = {
  upload: '/ofx/upload',
  detectDuplicates: '/ofx/detect-duplicates',
  execute: '/ofx/execute',
  status: '/ofx/status/:jobId',
} as const;

export const OFX_FULL_PATHS = {
  upload: `${IMPORT_ROUTER_PREFIX}${OFX_ROUTE_PATHS.upload}`,
  detectDuplicates: `${IMPORT_ROUTER_PREFIX}${OFX_ROUTE_PATHS.detectDuplicates}`,
  execute: `${IMPORT_ROUTER_PREFIX}${OFX_ROUTE_PATHS.execute}`,
} as const;
