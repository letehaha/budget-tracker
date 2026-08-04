import { createStatusController } from '@controllers/import-export/helpers/create-status-controller';
import { getMsMoneyImportProgress } from '@services/import-export/ms-money-import';

export const msMoneyStatusController = createStatusController({
  getProgress: getMsMoneyImportProgress,
  notFoundMessage: 'Microsoft Money import job not found.',
});
