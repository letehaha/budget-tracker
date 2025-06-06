import { createController } from '@controllers/helpers/controller-factory';
import * as authService from '@services/auth.service';
import { z } from 'zod';

export const login = createController(
  z.object({
    body: z.object({
      username: z.string(),
      password: z.string(),
    }),
  }),
  async ({ body }) => {
    const { username, password } = body;
    const token = await authService.login({ username, password });
    return { data: token };
  },
);

export const register = createController(
  z.object({
    body: z.object({
      username: z.string(),
      password: z.string(),
    }),
  }),
  async ({ body }) => {
    const { username, password } = body;
    const user = await authService.register({ username, password });
    return { data: { user }, statusCode: 201 };
  },
);

// Noop, token validation happens in middlewares
export const validateToken = createController(z.object({}), async () => {});
