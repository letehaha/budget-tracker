import { createStatusController } from '@controllers/import-export/helpers/create-status-controller';
import { getStatementImportProgress } from '@services/import-export/statement-parser/statement-import-queue';

export const importStatusController = createStatusController({
  getProgress: getStatementImportProgress,
  notFoundMessage: 'Statement import job not found.',
});
