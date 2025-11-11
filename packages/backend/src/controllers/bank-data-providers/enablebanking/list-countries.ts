import { createController } from '@controllers/helpers/controller-factory';
import { ValidationError } from '@js/errors';
import { listCountries } from '@root/services/bank-data-providers/enablebanking/aspsp.service';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    appId: z.string().min(1, 'Application ID is required'),
    privateKey: z.string().min(1, 'Private key is required'),
  }),
});

/**
 * POST /api/bank-data-providers/enablebanking/countries
 * Get list of countries supported by Enable Banking
 */
export default createController(schema, async ({ body }) => {
  try {
    const countries = await listCountries({
      appId: body.appId,
      privateKey: body.privateKey,
    });

    return {
      data: { countries },
    };
  } catch (error) {
    console.log('error', error);
    throw new ValidationError({ message: 'Failed to fetch countries. Please check your credentials.' });
  }
});
