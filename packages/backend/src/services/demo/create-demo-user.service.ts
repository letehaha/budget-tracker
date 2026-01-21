import { USER_ROLES } from '@bt/shared/types';
import { authPool } from '@config/auth';
import { logger } from '@js/utils/logger';
import { createUser } from '@models/Users.model';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import { seedDemoData } from './seed-demo-data.service';

/**
 * Creates a demo user with all associated data.
 *
 * This service:
 * 1. Creates a better-auth user with password for session management
 * 2. Creates the app user with role 'demo'
 * 3. Seeds demo data (accounts, categories, transactions, budgets)
 * 4. Returns credentials for sign-in via better-auth
 */
export async function createDemoUser(): Promise<{
  user: { id: number; username: string; role: string };
  email: string;
  password: string;
}> {
  const demoId = uuidv4();
  const demoEmail = `demo-${demoId}@demo.local`;
  const demoUsername = `demo-${demoId.slice(0, 8)}`;
  // Generate a random password for the demo user
  const demoPassword = uuidv4();

  logger.info(`Creating demo user: ${demoUsername}`);

  try {
    // 1. Create better-auth user directly in the database
    // We bypass the normal signup flow to avoid email verification
    const authUserId = uuidv4();
    const now = new Date();

    await authPool.query(
      `INSERT INTO ba_user (id, email, name, "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, $4, $5)`,
      [authUserId, demoEmail, demoUsername, now, now],
    );

    // Hash the password using bcrypt (same as better-auth config)
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(demoPassword, salt);

    // Create a credential account with password for the auth user
    await authPool.query(
      `INSERT INTO ba_account (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $3, $4, $5, $6)`,
      [uuidv4(), authUserId, authUserId, hashedPassword, now, now],
    );

    // 2. Create app user with demo role
    const appUser = await createUser({
      username: demoUsername,
      email: demoEmail,
      authUserId,
      role: USER_ROLES.demo,
    });

    logger.info(`Created demo app user with id: ${appUser.id}`);

    // 3. Seed demo data (accounts, transactions, budgets, etc.)
    await seedDemoData({ userId: appUser.id });

    logger.info(`Seeded demo data for user: ${appUser.id}`);

    // Return credentials so the controller can sign in via better-auth
    return {
      user: { id: appUser.id, username: appUser.username, role: appUser.role },
      email: demoEmail,
      password: demoPassword,
    };
  } catch (error) {
    logger.error({ message: 'Failed to create demo user', error: error as Error });
    throw error;
  }
}
