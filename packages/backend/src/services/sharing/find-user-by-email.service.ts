import Users from '@models/users.model';
import { authPool } from '@root/config/auth';

interface UserByEmailResult {
  appUser: Users;
  email: string;
  authUserId: string;
}

/**
 * Resolve an email address to the corresponding app `Users` row.
 *
 * Email lives in the better-auth `ba_user` table; the app `Users` row is linked via
 * `authUserId`. Returns `null` if no matching ba_user, or if the matching ba_user has no
 * app row (e.g. signup hook failed and the orphan was rolled back).
 */
export const findUserByEmail = async ({ email }: { email: string }): Promise<UserByEmailResult | null> => {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;

  // ba_user.email is case-sensitive; better-auth stores it as the user typed it.
  // Compare case-insensitively here so invitations to `Foo@Bar.com` find the same
  // account as `foo@bar.com` — matches the expectation set by the better-auth
  // sign-in flow which normalizes input before lookup.
  const { rows } = await authPool.query<{ id: string; email: string }>(
    'SELECT id, email FROM ba_user WHERE LOWER(email) = $1 LIMIT 1',
    [trimmed],
  );
  const baUser = rows[0];
  if (!baUser) return null;

  const appUser = await Users.findOne({ where: { authUserId: baUser.id } });
  if (!appUser) return null;

  return { appUser, email: baUser.email, authUserId: baUser.id };
};

/**
 * Reverse lookup: given an app `Users.id`, return the better-auth-stored email. Used by
 * the share accept/decline flow to bind a logged-in user to an invitation that was sent
 * before the user existed (`inviteeUserId IS NULL`). Returns `null` if the user has no
 * `ba_user` record (shouldn't happen for active users, but stay defensive).
 */
export const getEmailForUser = async ({ userId }: { userId: number }): Promise<string | null> => {
  const appUser = await Users.findByPk(userId, { attributes: ['authUserId'] });
  if (!appUser?.authUserId) return null;
  const { rows } = await authPool.query<{ email: string }>('SELECT email FROM ba_user WHERE id = $1 LIMIT 1', [
    appUser.authUserId,
  ]);
  return rows[0]?.email ?? null;
};
