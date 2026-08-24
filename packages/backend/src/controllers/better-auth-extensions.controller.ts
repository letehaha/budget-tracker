/**
 * Controllers that wrap better-auth server-side only APIs.
 */
import { auth } from '@config/auth';
import { createController } from '@controllers/helpers/controller-factory';
import { areSignupsOpen } from '@services/user/signups-open.service';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';

export const signupsOpen = createController(z.object({}), async () => {
  return { data: { signupsOpen: await areSignupsOpen() } };
});

/**
 * Set password for OAuth-only users.
 * Wraps auth.api.setPassword() which is server-side only in better-auth.
 */
export const setPassword = createController(
  z.object({
    body: z.object({
      newPassword: z.string().min(8),
    }),
  }),
  async ({ body, req }) => {
    const result = await auth.api.setPassword({
      body,
      headers: fromNodeHeaders(req.headers),
    });

    return { data: result };
  },
);
