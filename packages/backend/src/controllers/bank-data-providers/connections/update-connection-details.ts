import { BANK_PROVIDER_TYPE } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { t } from '@i18n/index';
import BankDataProviderConnections from '@models/BankDataProviderConnections.model';
import { NotFoundError } from '@root/js/errors';
import { bankProviderRegistry } from '@services/bank-data-providers';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      connectionId: z.coerce.number(),
    }),
    body: z
      .object({
        providerName: z.string().min(1).max(255).optional(),
        credentials: z.record(z.string(), z.unknown()).optional(),
      })
      .refine((data) => data.providerName !== undefined || data.credentials !== undefined, {
        message: 'At least one of providerName or credentials must be provided',
      }),
  }),
  async ({ user, params, body }) => {
    const connection = await BankDataProviderConnections.findOne({
      where: {
        id: params.connectionId,
        userId: user.id,
      },
    });

    if (!connection) {
      throw new NotFoundError({
        message: t({ key: 'errors.connectionNotFound' }),
      });
    }

    if (body.providerName !== undefined) {
      connection.providerName = body.providerName;
      await connection.save();
    }

    // If credentials are provided, validate and update via the provider
    if (body.credentials) {
      const provider = bankProviderRegistry.get(connection.providerType as BANK_PROVIDER_TYPE);
      await provider.refreshCredentials(connection.id, body.credentials);
      await connection.reload();
    }

    return {
      data: {
        connection: {
          id: connection.id,
          providerName: connection.providerName,
          providerType: connection.providerType,
          isActive: connection.isActive,
          lastSyncAt: connection.lastSyncAt,
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
        },
      },
    };
  },
);
