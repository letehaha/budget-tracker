/* eslint-disable @typescript-eslint/no-explicit-any */
import { subDays } from 'date-fns';
import fs from 'fs';
import path from 'path';
import { QueryInterface, QueryTypes } from 'sequelize';

/**
 * Seeds exchange rates for all currency pairs using test data
 * This creates baseline exchange rates needed for the application to function
 * Uses historical date to avoid conflicts with test mocks
 */
export const seedExchangeRates = async (queryInterface: QueryInterface): Promise<void> => {
  try {
    // Check if exchange rates already exist to avoid duplicates
    const existingRates = await queryInterface.sequelize.query('SELECT COUNT(*) as count FROM "ExchangeRates"', {
      type: QueryTypes.SELECT,
    });

    if ((existingRates[0] as any).count > 0) {
      // Exchange rates already seeded
      return;
    }

    // Load test exchange rates data
    const testDataPath = path.join(__dirname, '..', 'tests', 'test-exchange-rates.json');
    const data = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));

    // Get all currencies from database
    const currencies = await queryInterface.sequelize.query('SELECT * FROM "Currencies"', { type: QueryTypes.SELECT });

    const currenciesMap = currencies.reduce((acc: any, curr: any) => {
      acc[curr.code] = curr;
      return acc;
    }, {});

    // Use a date 10 days ago to avoid conflicts with test mocks
    const seedDate = subDays(new Date(), 10);

    // Generate exchange rate pairs for all currencies
    const exchangeRates: any[] = [];

    for (const currency of currencies as any[]) {
      for (const [quoteCode] of Object.entries(data.rates)) {
        // Skip if quote currency doesn't exist in our database
        if (!currenciesMap[quoteCode]) {
          continue;
        }

        // Calculate rate: BASE / QUOTE
        const calculatedRate = (data.rates as any)[quoteCode] / (data.rates as any)[currency.code];

        // Skip if calculation results in NaN
        if (Number.isNaN(calculatedRate)) {
          continue;
        }

        exchangeRates.push({
          baseId: currency.id,
          baseCode: currency.code,
          quoteId: currenciesMap[quoteCode].id,
          quoteCode: quoteCode,
          rate: quoteCode === currency.code ? 1 : calculatedRate,
          date: seedDate,
        });
      }
    }

    // Bulk insert exchange rates
    if (exchangeRates.length > 0) {
      await queryInterface.bulkInsert('ExchangeRates', exchangeRates);
    }
  } catch (error) {
    console.error('❌ Exchange rates seeding failed:', error);
    throw error;
  }
};
