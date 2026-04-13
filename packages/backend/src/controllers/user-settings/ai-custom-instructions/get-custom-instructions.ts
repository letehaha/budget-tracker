import { createController } from '@controllers/helpers/controller-factory';
import { getCustomInstructions } from '@services/user-settings/ai-custom-instructions';
import { z } from 'zod';

const schema = z.object({});

export const getCustomInstructionsController = createController(schema, async ({ user }) => {
  const { id: userId } = user;

  const instructions = await getCustomInstructions({ userId });

  return {
    data: { instructions: instructions ?? null },
  };
});
