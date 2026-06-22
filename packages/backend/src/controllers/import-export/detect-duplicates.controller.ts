import { createController } from '@controllers/helpers/controller-factory';
import { detectDuplicates } from '@services/import-export/csv-import/detect-duplicates';
import { z } from 'zod';

import {
  accountMappingValueSchema,
  categoryMappingValueSchema,
  columnMappingConfigSchema,
  tagMappingValueSchema,
} from './shared-schemas';

export const detectDuplicatesController = createController(
  z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
      delimiter: z.string().min(1, 'Delimiter is required'),
      columnMapping: columnMappingConfigSchema,
      accountMapping: z.record(z.string(), accountMappingValueSchema),
      categoryMapping: z.record(z.string(), categoryMappingValueSchema),
      // Carried for the frontend round-trip; duplicate detection itself needs
      // only the mapped tag column to populate each row's tagNames. The mapping
      // is consumed when the import is executed.
      tagMapping: z.record(z.string(), tagMappingValueSchema).optional(),
      // IANA timezone of the importing user's browser. Validation stays loose (any
      // non-empty string): the service tolerates an unknown zone by falling back
      // to UTC anchoring rather than rejecting the whole import.
      timezone: z.string().min(1).optional(),
    }),
  }),
  async ({ user, body }) => {
    const { fileContent, delimiter, columnMapping, accountMapping, categoryMapping, timezone } = body;

    const result = await detectDuplicates({
      userId: user.id,
      fileContent,
      delimiter,
      columnMapping,
      accountMapping,
      categoryMapping,
      timezone,
    });

    return {
      data: result,
    };
  },
);
