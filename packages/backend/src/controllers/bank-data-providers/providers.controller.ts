import { createController } from '@controllers/helpers/controller-factory';
import { bankProviderRegistry } from '@services/bank-data-providers';
import { z } from 'zod';

/**
 * GET /api/bank-data-providers
 * List all available bank data providers with their metadata
 */
export const listProviders = createController(z.object({}), async () => {
  const providers = bankProviderRegistry.listAll();

  return {
    data: {
      providers: providers.map((metadata) => ({
        type: metadata.type,
        name: metadata.name,
        description: metadata.description,
        logoUrl: metadata.logoUrl,
        documentationUrl: metadata.documentationUrl,
        features: metadata.features,
        credentialFields: metadata.credentialFields,
      })),
    },
  };
});
