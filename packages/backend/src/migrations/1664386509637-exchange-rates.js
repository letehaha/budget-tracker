const QueryTypes = require('sequelize').QueryTypes;
const axios = require('axios');
const fs = require('fs');
const { subDays } = require('date-fns');

const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      let data = {
        data: JSON.parse(fs.readFileSync('./src/tests/test-exchange-rates.json')),
      };

      const currencies = await queryInterface.sequelize.query('SELECT * FROM "Currencies"', {
        type: QueryTypes.SELECT,
      });

      await queryInterface.createTable(
        'ExchangeRates',
        {
          id: {
            type: Sequelize.INTEGER,
            unique: true,
            allowNull: false,
            autoIncrement: true,
            primaryKey: true,
          },
          baseCode: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          quoteCode: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          rate: {
            type: Sequelize.FLOAT,
            allowNull: true,
            defaultValue: 1,
          },
          date: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'ExchangeRates',
        'baseId',
        {
          type: Sequelize.INTEGER,
          references: {
            model: 'Currencies',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'ExchangeRates',
        'quoteId',
        {
          type: Sequelize.INTEGER,
          references: {
            model: 'Currencies',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        { transaction },
      );

      await queryInterface.addColumn(
        'Currencies',
        'isDisabled',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        { transaction },
      );

      const excludedCurrencies = new Set();

      const DBCurrenciesToObject = currencies.reduce((acc, curr) => {
        acc[curr.code] = curr;

        return acc;
      }, {});

      // Fill exchange rates for the previous date, so that it won't conflict with
      // our mocks and tests for exchange rates external API
      const prevDate = subDays(new Date(), 10);

      const currenciesWithRates = currencies.reduce((currenciesList, currency) => {
        currenciesList.push(
          ...Object.entries(data.data.rates).reduce((acc, [code, rate]) => {
            // BASE / QUOTE
            const calculatedRate = data.data.rates[code] / data.data.rates[currency.code];

            // 3-rd party service might return currencies which are not exist in our DB
            if (!DBCurrenciesToObject[code]) {
              return acc;
            }

            if (Number.isNaN(calculatedRate)) {
              excludedCurrencies.add(currency.code);
            } else {
              acc.push({
                baseId: DBCurrenciesToObject[currency.code].id,
                baseCode: currency.code,
                quoteId: DBCurrenciesToObject[code].id,
                quoteCode: code,
                rate: code === currency.code ? 1 : calculatedRate,
                date: prevDate,
              });
            }

            return acc;
          }, []),
        );

        return currenciesList;
      }, []);

      await queryInterface.bulkInsert('ExchangeRates', currenciesWithRates, {
        transaction,
      });

      // if some currency doesn't have rate, disable it
      await (async () => {
        for (const currencyCode of excludedCurrencies) {
          await queryInterface.sequelize.query(
            `
            UPDATE "Currencies" SET "isDisabled"='1' WHERE "id"=${DBCurrenciesToObject[currencyCode].id}
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
  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn('Currencies', 'isDisabled', {
        transaction,
      });
      await queryInterface.dropTable('ExchangeRates', { transaction });

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  },
};
