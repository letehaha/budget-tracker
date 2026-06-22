import { createController } from '@controllers/helpers/controller-factory';
import { extractUniqueValues } from '@services/import-export/csv-import/extract-unique-values';
import { z } from 'zod';

import { columnMappingConfigSchema } from './shared-schemas';

export const extractUniqueValuesController = createController(
  z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
      delimiter: z.string().min(1, 'Delimiter is required'),
      columnMapping: columnMappingConfigSchema,
    }),
  }),
  async ({ user, body }) => {
    const { fileContent, delimiter, columnMapping } = body;

    const result = await extractUniqueValues({
      userId: user.id,
      fileContent,
      delimiter,
      columnMapping,
    });

    return {
      data: result,
    };
  },
);
