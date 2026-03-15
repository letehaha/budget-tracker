import { USER_ROLES } from '@bt/shared/types';
import { authPool } from '@config/auth';
import { logger } from '@js/utils/logger';
import { createUser } from '@models/Users.model';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

interface DemoUserResult {
  user: { id: number; username: string; role: string };
  email: string;
  password: string;
}

/**
 * Creates ONLY the user + auth records WITHOUT seeding data.
 * Data is applied separately via applyDemoTemplate for the fast path.
 */
export async function createDemoUserFast(): Promise<DemoUserResult> {
  const demoId = uuidv4();
  const demoEmail = `demo-${demoId}@demo.local`;
  const demoUsername = `demo-${demoId.slice(0, 8)}`;
  const demoPassword = uuidv4();

  logger.info(`Creating demo user: ${demoUsername}`);

  const authUserId = uuidv4();
  const now = new Date();

  await authPool.query(
    `INSERT INTO ba_user (id, email, name, "emailVerified", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, $4, $5)`,
    [authUserId, demoEmail, demoUsername, now, now],
  );

  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(demoPassword, salt);

  await authPool.query(
    `INSERT INTO ba_account (id, "userId", "providerId", "accountId", password, "createdAt", "updatedAt")
     VALUES ($1, $2, 'credential', $3, $4, $5, $6)`,
    [uuidv4(), authUserId, authUserId, hashedPassword, now, now],
  );

  const appUser = await createUser({
    username: demoUsername,
    email: demoEmail,
    authUserId,
    role: USER_ROLES.demo,
  });

  logger.info(`Created demo app user with id: ${appUser.id}`);

  return {
    user: { id: appUser.id, username: appUser.username, role: appUser.role },
    email: demoEmail,
    password: demoPassword,
  };
}
