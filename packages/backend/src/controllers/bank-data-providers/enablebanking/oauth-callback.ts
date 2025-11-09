import { createController } from '@controllers/helpers/controller-factory';
import { BadRequestError, NotFoundError } from '@js/errors';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { BankProviderType, bankProviderRegistry } from '@root/services/bank-data-providers';
import { EnableBankingProvider } from '@root/services/bank-data-providers/enablebanking';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    connectionId: z.number().int().positive('Connection ID must be a positive integer'),
    code: z.string().min(1, 'Authorization code is required'),
    state: z.string().min(1, 'State parameter is required'),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }),
});

/**
 * POST /api/bank-data-providers/enablebanking/oauth-callback
 * Handle OAuth callback after user authorization
 */
export default createController(schema, async ({ body, user }) => {
  const { connectionId, code, state, error, error_description } = body;

  // Verify connection exists and belongs to user
  const connection = await BankDataProviderConnections.findOne({
    where: {
      id: connectionId,
      userId: user.id,
      providerType: BankProviderType.ENABLE_BANKING,
    },
  });

  if (!connection) {
    throw new NotFoundError({ message: 'Connection not found or does not belong to you' });
  }

  // Get provider instance
  const provider = bankProviderRegistry.get(BankProviderType.ENABLE_BANKING) as EnableBankingProvider;

  // Handle OAuth callback
  try {
    await provider.handleOAuthCallback(connectionId, {
      code,
      state,
      error,
      error_description,
    });

    return {
      data: {
        success: true,
        message: 'Connection successfully established',
        connectionId,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to complete OAuth flow';
    throw new BadRequestError({
      message: errorMessage,
    });
  }
});
