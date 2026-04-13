import { AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { setCustomInstructions } from '@services/user-settings/ai-custom-instructions';
import { z } from 'zod';

const schema = z.object({
  body: z.object({
    instructions: z.string().max(AI_CUSTOM_INSTRUCTIONS_MAX_LENGTH),
  }),
});

export const setCustomInstructionsController = createController(schema, async ({ user, body }) => {
  const { id: userId } = user;
  const { instructions } = body;

  await setCustomInstructions({ userId, instructions });

  return {
    data: { success: true },
  };
});
