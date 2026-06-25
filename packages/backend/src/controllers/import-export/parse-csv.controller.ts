import { createParseController } from '@controllers/import-export/helpers/create-parse-controller';
import { parseCSV } from '@root/services/import-export/csv-import/csv-parser.service';
import { z } from 'zod';

export const parseCsv = createParseController({
  schema: z.object({
    body: z.object({
      fileContent: z.string().min(1, 'File content cannot be empty'),
      delimiter: z.string().optional(),
    }),
  }),
  parse: ({ fileContent, delimiter }) => parseCSV({ fileContent, delimiter, previewLimit: 50 }),
  // CSV returns the parsed value flat (`{ data: result }`), unlike Wallet/YNAB.
  wrap: (result) => result,
});
