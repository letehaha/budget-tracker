const allCurrencies = require('currency-codes/data');
const { QueryTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.startUnmanagedTransaction();

    try {
      // find old currencies
      const oldCurrencies = await queryInterface.sequelize.query(
        `
        SELECT "id", "code" FROM "Currencies"
      `,
        { type: QueryTypes.SELECT, transaction },
      );

      // create and return new currencies
      const newCurrencies = await queryInterface.bulkInsert(
        'Currencies',
        allCurrencies.map((item) => ({
          currency: item.currency,
          digits: item.digits,
          number: Number(item.number),
          code: item.code,
        })),
        { transaction, returning: true },
      );

      // replace old ids with new ids
      await (async () => {
        for (const item of oldCurrencies) {
          const oldId = item.id;
          const newId = newCurrencies.find((n) => n.code === item.code).id;

          await queryInterface.sequelize.query(
            `
            UPDATE "MonobankTransactions" SET "currencyId"=${newId} WHERE "currencyId"=${oldId}
          `,
            { transaction },
          );
          await queryInterface.sequelize.query(
            `
            UPDATE "Transactions" SET "currencyId"=${newId} WHERE "currencyId"=${oldId}
          `,
            { transaction },
          );
          await queryInterface.sequelize.query(
            `
            UPDATE "MonobankAccounts" SET "currencyId"=${newId} WHERE "currencyId"=${oldId}
          `,
            { transaction },
          );
          await queryInterface.sequelize.query(
            `
            UPDATE "Accounts" SET "currencyId"=${newId} WHERE "currencyId"=${oldId}
          `,
            { transaction },
          );
          await queryInterface.sequelize.query(
            `
            UPDATE "UsersCurrencies" SET "currencyId"=${newId} WHERE "currencyId"=${oldId}
          `,
            { transaction },
          );

          // delete old currencies from the Currencies table
          await queryInterface.sequelize.query(
            `
            DELETE FROM "Currencies" WHERE "id"=${oldId};
          `,
            { transaction },
          );
        }
      })();

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
  down: async (queryInterface) => {},
};
