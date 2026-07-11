import { QueryInterface } from 'sequelize';

/**
 * Enforce one UserSettings row per user (the row is created lazily, so
 * concurrent first-writes could insert duplicates under the old non-unique
 * index). `up` collapses any existing duplicates (keeping the newest row per
 * user) before swapping the non-unique index for a UNIQUE one. Raw SQL keeps it
 * self-contained for the production boot-time migrate step.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Keep the newest row per user (tie-break on uuidv7 id), delete the rest.
      // Nothing references UserSettings.id, so the delete is safe.
      await queryInterface.sequelize.query(
        `
        DELETE FROM "UserSettings"
        WHERE "id" IN (
          SELECT "id" FROM (
            SELECT
              "id",
              ROW_NUMBER() OVER (
                PARTITION BY "userId"
                ORDER BY "updatedAt" DESC, "id" DESC
              ) AS rn
            FROM "UserSettings"
          ) ranked
          WHERE ranked.rn > 1
        );
        `,
        { transaction },
      );

      // Old index was unnamed → Sequelize named it `user_settings_user_id`.
      // IF EXISTS so a missing index can't halt the deploy.
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS "user_settings_user_id";', { transaction });

      await queryInterface.addIndex('UserSettings', ['userId'], {
        name: 'user_settings_user_id_unique',
        unique: true,
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.removeIndex('UserSettings', 'user_settings_user_id_unique', { transaction });

      // Restore the original non-unique lookup index.
      await queryInterface.addIndex('UserSettings', ['userId'], {
        name: 'user_settings_user_id',
        transaction,
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
