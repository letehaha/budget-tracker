import { AbstractQueryInterface } from '@sequelize/core';

export default {
  up: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `ALTER TABLE "UsersCurrencies" ALTER COLUMN "exchangeRate" TYPE DOUBLE PRECISION USING "exchangeRate"::DOUBLE PRECISION`,
    );
  },

  down: async (queryInterface: AbstractQueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(
      `ALTER TABLE "UsersCurrencies" ALTER COLUMN "exchangeRate" TYPE INTEGER USING "exchangeRate"::INTEGER`,
    );
  },
};
