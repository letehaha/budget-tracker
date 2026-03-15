import type { NavigationGuard } from 'vue-router';

import { loadChunksForRoute } from './index';

/**
 * Navigation guard that loads i18n chunks before route enters.
 * Chunks are collected from the target route and all parent routes.
 */
export const i18nChunkGuard: NavigationGuard = async (to) => {
  await loadChunksForRoute({ route: to });
  return true;
};
