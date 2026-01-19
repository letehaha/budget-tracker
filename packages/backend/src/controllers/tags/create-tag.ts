import { createController } from '@controllers/helpers/controller-factory';
import * as tagsService from '@services/tags';
import * as onboardingService from '@services/user-settings/onboarding';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must not exceed 100 characters').trim(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g., #FF5733)')
      .transform((v) => v.toLowerCase()),
    icon: z.string().max(50, 'Icon name must not exceed 50 characters').nullable().optional(),
    description: z.string().max(500, 'Description must not exceed 500 characters').nullable().optional(),
  }),
});

export default createController(schema, async ({ user, body }) => {
  const { name, color, icon, description } = body;

  const data = await tagsService.createTag({
    userId: user.id,
    name,
    color,
    icon: icon ?? null,
    description: description ?? null,
  });

  // Mark onboarding task as complete (fire and forget)
  onboardingService.markTaskComplete({ userId: user.id, taskId: 'create-tag' }).catch(() => {});

  return { data };
});
