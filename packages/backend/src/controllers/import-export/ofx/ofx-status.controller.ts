import { createStatusController } from '@controllers/import-export/helpers/create-status-controller';
import { getOfxImportProgress } from '@services/import-export/ofx-import';

export const ofxStatusController = createStatusController({
  getProgress: getOfxImportProgress,
  notFoundMessage: 'OFX import job not found.',
});
