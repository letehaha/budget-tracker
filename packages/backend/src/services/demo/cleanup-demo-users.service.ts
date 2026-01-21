import { USER_ROLES } from '@bt/shared/types';
import { logger } from '@js/utils/logger';
import Users from '@models/Users.model';
import { deleteUser } from '@services/user/delete-user.service';
import { subHours } from 'date-fns';
import { Op } from 'sequelize';

// Demo users expire after 4 hours
const DEMO_EXPIRY_HOURS = 4;

/**
 * Cleans up a single demo user and all their data.
 * Uses the existing deleteUser service which handles:
 * - BullMQ queue cleanup
 * - Redis cache cleanup
 * - App data deletion via CASCADE (accounts, transactions, categories, budgets, etc.)
 * - Better-auth data (ba_user, ba_session, ba_account)
 */
export async function cleanupDemoUser({ userId }: { userId: number }): Promise<void> {
  logger.info(`Cleaning up demo user: ${userId}`);

  try {
    // Verify this is actually a demo user before deleting
    const user = await Users.findOne({
      where: { id: userId, role: USER_ROLES.demo },
      attributes: ['id'],
      raw: true,
    });

    if (!user) {
      logger.warn(`Demo user ${userId} not found or not a demo user`);
      return;
    }

    // Use the existing deleteUser service which properly handles cascade deletion
    await deleteUser({ userId });

    logger.info(`Successfully cleaned up demo user: ${userId}`);
  } catch (error) {
    logger.error({ message: `Failed to cleanup demo user: ${userId}`, error: error as Error });
    throw error;
  }
}

/**
 * Finds and cleans up all expired demo users.
 * A demo user is considered expired if they were created more than DEMO_EXPIRY_HOURS ago.
 */
export async function cleanupExpiredDemoUsers(): Promise<number> {
  const expiryDate = subHours(new Date(), DEMO_EXPIRY_HOURS);

  logger.info(`Looking for demo users created before: ${expiryDate.toISOString()}`);

  try {
    // Find all expired demo users
    const expiredUsers = await Users.findAll({
      where: {
        role: USER_ROLES.demo,
        createdAt: {
          [Op.lt]: expiryDate,
        },
      },
      attributes: ['id', 'username', 'createdAt'],
      raw: true,
    });

    if (expiredUsers.length === 0) {
      logger.info('No expired demo users found');
      return 0;
    }

    logger.info(`Found ${expiredUsers.length} expired demo users to clean up`);

    // Clean up each expired user
    for (const user of expiredUsers) {
      try {
        await cleanupDemoUser({ userId: user.id });
      } catch (error) {
        // Log but continue with other users
        logger.error({
          message: `Failed to cleanup expired demo user ${user.id}`,
          error: error as Error,
        });
      }
    }

    logger.info(`Cleaned up ${expiredUsers.length} expired demo users`);
    return expiredUsers.length;
  } catch (error) {
    logger.error({ message: 'Failed to cleanup expired demo users', error: error as Error });
    throw error;
  }
}
