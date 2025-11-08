import { createController } from '@controllers/helpers/controller-factory';
import { connectProvider } from '@root/services/bank-data-providers/connection/connect-provider';
import { BankProviderType } from '@services/bank-data-providers';
import { z } from 'zod';

export default createController(
  z.object({
    params: z.object({
      providerType: z.nativeEnum(BankProviderType),
    }),
    body: z.object({
      credentials: z.record(z.unknown()),
      providerName: z.string().optional(),
    }),
  }),
  async ({ user, params, body }) => {
    const data = await connectProvider({
      providerType: params.providerType,
      userId: user.id,
      credentials: body.credentials,
      providerName: body.providerName,
    });

    return {
      data,
    };
  },
);
