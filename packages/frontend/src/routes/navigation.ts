import type { Router } from 'vue-router';

import { ROUTES_NAMES } from './constants';

/**
 * Open a bank connection's details page. No-op when the id is absent so callers can wire
 * it straight to a button on a row that may or may not be bank-linked.
 */
export const goToConnectionDetails = ({
  router,
  connectionId,
}: {
  router: Router;
  connectionId: string | null | undefined;
}) => {
  if (!connectionId) return;
  router.push({ name: ROUTES_NAMES.accountIntegrationDetails, params: { connectionId } });
};
