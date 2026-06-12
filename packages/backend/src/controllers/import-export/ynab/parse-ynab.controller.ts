import { createController } from '@controllers/helpers/controller-factory';
import { parseYnabRegister } from '@root/services/import-export/ynab-import/parse-ynab.service';
import { z } from 'zod';

export const parseYnabController = createController(
  z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
    }),
  }),
  async ({ body }) => {
    const { fileContent } = body;
    const result = parseYnabRegister({ fileContent });
    return { data: { result } };
  },
);
