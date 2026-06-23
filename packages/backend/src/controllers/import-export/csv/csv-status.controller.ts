import { createStatusController } from '@controllers/import-export/helpers/create-status-controller';
import { getCsvImportProgress } from '@services/import-export/csv-import/csv-import-queue';

export const csvStatusController = createStatusController({
  getProgress: getCsvImportProgress,
  notFoundMessage: 'CSV import job not found.',
});
