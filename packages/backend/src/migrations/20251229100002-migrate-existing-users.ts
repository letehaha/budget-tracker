import crypto from 'crypto';
import { QueryInterface, Transaction } from 'sequelize';

interface ExistingUser {
  id: number;
  username: string;
  email: string | null;
  password: string | null;
}

/**
 * Migration to move existing users to better-auth tables.
 * Creates ba_user and ba_account records for each existing user.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Get all existing users that haven't been migrated yet
      const [existingUsers] = (await queryInterface.sequelize.query(
        `SELECT id, username, email, password FROM "Users" WHERE "authUserId" IS NULL`,
        { transaction: t },
      )) as [ExistingUser[], unknown];

      if (existingUsers.length === 0) {
        console.log('No users to migrate');
        await t.commit();
        return;
      }

      console.log(`Migrating ${existingUsers.length} existing users to better-auth`);

      for (const user of existingUsers) {
        const authUserId = crypto.randomUUID();

        // Generate email for better-auth (required field)
        // If user had email, use it; otherwise generate placeholder
        const email = user.email || `${user.username}@app.migrated`;

        // Create better-auth user
        await queryInterface.sequelize.query(
          `INSERT INTO "ba_user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
           VALUES (:authUserId, :username, :email, :emailVerified, NOW(), NOW())`,
          {
            replacements: {
              authUserId,
              username: user.username,
              email,
              // Always mark migrated users as verified - they were already using the system
              // Legacy users with @app.migrated emails will be prompted to add real email
              emailVerified: true,
            },
            transaction: t,
          },
        );

        // Create credential account with existing password hash (if user has password)
        if (user.password) {
          const accountId = crypto.randomUUID();
          await queryInterface.sequelize.query(
            `INSERT INTO "ba_account" (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
             VALUES (:accountId, :authUserId, :username, 'credential', :password, NOW(), NOW())`,
            {
              replacements: {
                accountId,
                authUserId,
                username: user.username,
                password: user.password,
              },
              transaction: t,
            },
          );
        }

        // Link app user to auth user
        await queryInterface.sequelize.query(`UPDATE "Users" SET "authUserId" = :authUserId WHERE id = :userId`, {
          replacements: {
            authUserId,
            userId: user.id,
          },
          transaction: t,
        });
      }

      console.log(`Successfully migrated ${existingUsers.length} users to better-auth`);

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const t: Transaction = await queryInterface.sequelize.transaction();

    try {
      // Get all migrated users (those with authUserId set)
      const [migratedUsers] = (await queryInterface.sequelize.query(
        `SELECT id, "authUserId" FROM "Users" WHERE "authUserId" IS NOT NULL`,
        { transaction: t },
      )) as [Array<{ id: number; authUserId: string }>, unknown];

      if (migratedUsers.length === 0) {
        console.log('No migrated users to rollback');
        await t.commit();
        return;
      }

      console.log(`Rolling back ${migratedUsers.length} migrated users`);

      for (const user of migratedUsers) {
        // Delete better-auth account records (cascade will handle this, but let's be explicit)
        await queryInterface.sequelize.query(`DELETE FROM "ba_account" WHERE "userId" = :authUserId`, {
          replacements: { authUserId: user.authUserId },
          transaction: t,
        });

        // Delete better-auth user record
        await queryInterface.sequelize.query(`DELETE FROM "ba_user" WHERE id = :authUserId`, {
          replacements: { authUserId: user.authUserId },
          transaction: t,
        });

        // Unlink app user from auth user
        await queryInterface.sequelize.query(`UPDATE "Users" SET "authUserId" = NULL WHERE id = :userId`, {
          replacements: { userId: user.id },
          transaction: t,
        });
      }

      console.log(`Successfully rolled back ${migratedUsers.length} users`);

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
