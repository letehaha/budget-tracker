import { createController } from '@controllers/helpers/controller-factory';
import { listSupportedProviders } from '@root/services/bank-data-providers/list-supported-providers.service';
import { z } from 'zod';

/**
 * GET /api/bank-data-providers
 * List all available bank data providers with their metadata
 */
export const listProviders = createController(z.object({}), async () => {
  const providers = await listSupportedProviders();

  return {
    data: { providers },
  };
});
