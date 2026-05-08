import { QueryInterface } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // Drop synthetic '@app.migrated' users left over from the pre-better-auth
    // system. They were only reachable via the legacy username-login flow
    // (now removed) and have been locked out since. CASCADE handles related
    // app data (Users -> Accounts/Transactions/etc.) and auth state
    // (ba_user -> ba_session/ba_account/ba_passkey/...).
    await queryInterface.sequelize.query(`
      DELETE FROM "Users"
      WHERE "authUserId" IN (
        SELECT id FROM ba_user WHERE email LIKE '%@app.migrated'
      )
    `);

    await queryInterface.sequelize.query(`
      DELETE FROM ba_user WHERE email LIKE '%@app.migrated'
    `);
  },

  down: async (): Promise<void> => {
    // Irreversible — user data is permanently destroyed by the up migration.
  },
};
