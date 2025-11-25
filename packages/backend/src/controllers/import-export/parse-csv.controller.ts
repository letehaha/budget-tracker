import { createController } from '@controllers/helpers/controller-factory';
import { parseCSV } from '@root/services/import-export/csv-import/csv-parser.service';
import { z } from 'zod';

export const parseCsv = createController(
  z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
      delimiter: z.string().optional(),
    }),
  }),
  async ({ body }) => {
    const { fileContent, delimiter } = body;

    const result = parseCSV({ fileContent, delimiter, previewLimit: 50 });

    return {
      data: result,
    };
  },
);
