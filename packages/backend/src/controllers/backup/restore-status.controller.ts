import { createStatusController } from '@controllers/import-export/helpers/create-status-controller';
import { getBackupRestoreStatus } from '@services/backup';

/**
 * GET /user/backup/restore/status/:jobId
 *
 * Poll fallback for restore progress, reusing the shared async-job status
 * controller. Scoped to the current user (returns 404 for another user's job).
 */
export const restoreStatusController = createStatusController({
  getProgress: getBackupRestoreStatus,
  notFoundMessage: 'Backup restore job not found.',
});
