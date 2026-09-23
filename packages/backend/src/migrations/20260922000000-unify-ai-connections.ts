import { QueryInterface, QueryTypes } from 'sequelize';

import { unifyAiConnections } from './utils/unify-ai-connections';

/**
 * Folds `settings.ai.apiKeys` and `settings.ai.customEndpoints` into `settings.ai.connections`
 * and repoints every feature config at a connection id (or `null` for the server model).
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const rows: { id: string; settings: unknown }[] = await queryInterface.sequelize.query(
        `SELECT "id", "settings" FROM "UserSettings" WHERE "settings" -> 'ai' IS NOT NULL;`,
        { type: QueryTypes.SELECT, transaction },
      );

      let converted = 0;
      for (const row of rows) {
        const settings = unifyAiConnections({ settings: row.settings });
        if (settings === row.settings) continue;

        await queryInterface.sequelize.query(`UPDATE "UserSettings" SET "settings" = $1::jsonb WHERE "id" = $2`, {
          bind: [JSON.stringify(settings), row.id],
          transaction,
        });
        converted++;
      }

      console.log(`unify-ai-connections: converted ${converted} of ${rows.length} settings rows with AI data`);
    });
  },

  down: async (): Promise<void> => {
    throw new Error(
      'unify-ai-connections is irreversible: API keys and custom endpoints were merged into AI connections. Restore from a pre-migration backup instead.',
    );
  },
};
