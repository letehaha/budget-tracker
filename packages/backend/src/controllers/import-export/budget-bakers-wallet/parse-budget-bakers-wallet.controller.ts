import {
  createParseController,
  fileContentParseSchema,
} from '@controllers/import-export/helpers/create-parse-controller';
import { parseBudgetBakersWalletCsv } from '@services/import-export/budget-bakers-wallet-import';

export const parseBudgetBakersWalletController = createParseController({
  schema: fileContentParseSchema,
  parse: ({ fileContent }) => parseBudgetBakersWalletCsv({ fileContent }),
});
