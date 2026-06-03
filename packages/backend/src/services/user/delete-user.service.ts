import { authPool } from '@config/auth';
import { logger } from '@js/utils/logger';
import * as Users from '@models/users.model';

import { runUserDestroyLifecycle } from './user-destroy-lifecycle';

export const deleteUser = async ({ userId }: { userId: number }) => {
  // Captured inside the in-tx destroy step so the post-tx hook can hit the better-auth
  // pool with the right id. Kept here (not inside the orchestrator) because better-auth
  // is delete-user-specific — wipe-user-data preserves the auth row.
  let capturedAuthUserId: string | null = null;

  await runUserDestroyLifecycle({
    userId,
    stampCreatorSnapshot: true,
    cacheLogPrefix: 'user-deletion',
    failureLogCode: 'USER_DELETE_FAILED',
    failureLogMessage: 'User deletion failed',
    destroyInTx: async ({ user }) => {
      capturedAuthUserId = user.authUserId ?? null;
      await Users.default.destroy({ where: { id: userId } });
    },
    // Drop the better-auth row on its separate pool — must not share the app DB tx, since
    // a transient app-tx rollback would otherwise orphan a live ba_user against a deleted
    // app user. Logged-but-not-rethrown: the app user is already gone by this point.
    postTxBeforeFanOut: async () => {
      if (!capturedAuthUserId) return;
      try {
        await authPool.query('DELETE FROM ba_user WHERE id = $1', [capturedAuthUserId]);
        logger.info(`Deleted better-auth user ${capturedAuthUserId} for app user ${userId}`);
      } catch (authError) {
        logger.error({ message: 'Failed to delete better-auth user', error: authError as Error });
      }
    },
  });
};
