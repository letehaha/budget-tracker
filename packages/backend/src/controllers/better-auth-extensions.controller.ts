/**
 * Controllers that wrap better-auth server-side only APIs.
 */
import { auth } from '@config/auth';
import { createController } from '@controllers/helpers/controller-factory';
import { z } from 'zod';

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
      headers: req.headers as unknown as Headers,
    });

    return { data: result };
  },
);
