import { DataTypes, QueryInterface } from 'sequelize';

/**
 * Adds the settlement leg to investment transactions.
 *
 * A trade has two currency legs: the security's trading currency (price,
 * quantity) and the settlement currency — the currency in which cash actually
 * left/entered the brokerage account. Some brokers hold cash in a single
 * currency (e.g. PLN) while securities trade in another (e.g. USD), so the
 * deduction and the fee are recorded in the settlement currency.
 *
 * - settlementCurrencyCode: currency of the actual cash movement
 * - settlementAmount: absolute cash moved (buy: paid incl. fee; sell/dividend:
 *   received net of fee; fee/tax: amount charged)
 * - settlementFees: broker fee in settlement currency
 * - settlementRate: settlement currency units per 1 security currency unit
 *   (the broker's effective conversion rate; 1 when both legs share a currency)
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // currencyCode was never written by the create flow and sat at its 'USD'
    // default even for non-USD securities; align it with the holding's
    // currency before deriving settlement values from it.
    await queryInterface.sequelize.query(`
      UPDATE "InvestmentTransactions" it
      SET "currencyCode" = h."currencyCode"
      FROM "Holdings" h
      WHERE h."portfolioId" = it."portfolioId"
        AND h."securityId" = it."securityId"
        AND it."currencyCode" <> h."currencyCode"
    `);

    await queryInterface.addColumn('InvestmentTransactions', 'settlementCurrencyCode', {
      type: DataTypes.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn('InvestmentTransactions', 'settlementAmount', {
      type: DataTypes.DECIMAL(20, 10),
      allowNull: true,
    });
    await queryInterface.addColumn('InvestmentTransactions', 'settlementFees', {
      type: DataTypes.DECIMAL(20, 10),
      allowNull: true,
    });
    await queryInterface.addColumn('InvestmentTransactions', 'settlementRate', {
      type: DataTypes.DECIMAL(20, 10),
      allowNull: true,
    });

    // Existing rows settled in the security's own currency: rate 1, fee as
    // recorded, cash moved per category (amount = qty*price + fees, so net
    // proceeds for sell/dividend are amount - 2*fees).
    await queryInterface.sequelize.query(`
      UPDATE "InvestmentTransactions"
      SET "settlementCurrencyCode" = "currencyCode",
          "settlementFees" = "fees",
          "settlementRate" = 1,
          "settlementAmount" = CASE
            WHEN "category" IN ('sell', 'dividend') THEN "amount" - 2 * "fees"
            ELSE "amount"
          END
    `);

    await queryInterface.changeColumn('InvestmentTransactions', 'settlementCurrencyCode', {
      type: DataTypes.STRING,
      allowNull: false,
    });
    await queryInterface.changeColumn('InvestmentTransactions', 'settlementAmount', {
      type: DataTypes.DECIMAL(20, 10),
      allowNull: false,
    });
    await queryInterface.changeColumn('InvestmentTransactions', 'settlementFees', {
      type: DataTypes.DECIMAL(20, 10),
      allowNull: false,
    });
    await queryInterface.changeColumn('InvestmentTransactions', 'settlementRate', {
      type: DataTypes.DECIMAL(20, 10),
      allowNull: false,
    });
  },

  down: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.removeColumn('InvestmentTransactions', 'settlementCurrencyCode');
    await queryInterface.removeColumn('InvestmentTransactions', 'settlementAmount');
    await queryInterface.removeColumn('InvestmentTransactions', 'settlementFees');
    await queryInterface.removeColumn('InvestmentTransactions', 'settlementRate');
  },
};
