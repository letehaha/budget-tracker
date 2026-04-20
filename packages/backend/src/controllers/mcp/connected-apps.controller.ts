import { createController } from '@controllers/helpers/controller-factory';
import { Unauthorized } from '@js/errors';
import { getConnectedApps, revokeConnectedApp } from '@services/mcp/connected-apps';
import { z } from 'zod';

export const getConnectedAppsController = createController(z.object({}), async ({ user }) => {
  if (!user.authUserId) {
    throw new Unauthorized({ message: 'User not linked to auth account' });
  }
  const apps = await getConnectedApps({ authUserId: user.authUserId });
  return { data: apps };
});

export const revokeConnectedAppController = createController(
  z.object({
    params: z.object({
      clientId: z.string(),
    }),
  }),
  async ({ user, params }) => {
    if (!user.authUserId) {
      throw new Unauthorized({ message: 'User not linked to auth account' });
    }
    await revokeConnectedApp({
      authUserId: user.authUserId,
      clientId: params.clientId,
    });
    return { data: { success: true } };
  },
);
