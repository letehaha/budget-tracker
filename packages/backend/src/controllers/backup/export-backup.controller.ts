import { createController } from '@controllers/helpers/controller-factory';
import { logger } from '@js/utils';
import { exportUserBackup } from '@services/backup';
import { z } from 'zod';

/**
 * POST /user/backup
 *
 * Writes a binary zip directly to the response, bypassing the JSON envelope —
 * the controller-factory detects `res.headersSent` after the handler and skips
 * its serialization for this case.
 */
export const exportBackupController = createController(
  z.object({ body: z.object({}).optional() }),
  async ({ user, res, req }) => {
    req.on('close', () => {
      if (!res.writableEnded) {
        logger.info(`Backup export response aborted by client (userId=${user.id})`);
      }
    });

    try {
      const result = await exportUserBackup({ userId: user.id });

      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', result.buffer.length.toString());
      res.status(200).end(result.buffer);
      return;
    } catch (err) {
      logger.error({ message: `Backup export failed for userId=${user.id}`, error: err as Error });
      throw err;
    }
  },
);
