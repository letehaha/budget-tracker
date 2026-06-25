import { createStatusController } from '@controllers/import-export/helpers/create-status-controller';
import { getYnabImportProgress } from '@root/services/import-export/ynab-import';

export const ynabStatusController = createStatusController({
  getProgress: getYnabImportProgress,
  notFoundMessage: 'YNAB import job not found.',
});
