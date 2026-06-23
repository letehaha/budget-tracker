import {
  createParseController,
  fileContentParseSchema,
} from '@controllers/import-export/helpers/create-parse-controller';
import { parseYnabRegister } from '@root/services/import-export/ynab-import/parse-ynab.service';

export const parseYnabController = createParseController({
  schema: fileContentParseSchema,
  parse: ({ fileContent }) => parseYnabRegister({ fileContent }),
});
