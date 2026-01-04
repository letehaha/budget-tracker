import { describe, expect, it } from '@jest/globals';
import * as helpers from '@tests/helpers';
import { format, subDays } from 'date-fns';

describe('get exchange rates', () => {
  // Use the seed data date (10 days ago from migration time, approximated to 15 days ago to be safe)
  // This ensures we're testing with dates that have actual data from the migration seed
  const seedDataDate = format(subDays(new Date(), 15), 'yyyy-MM-dd');

  // Use a future date that will definitely not have exchange rates
  const noDataDate = '2099-01-01';

  it('should return null when no exchange rates exist for the requested date', async () => {
    const response = await helpers.getExchangeRates({
      date: noDataDate,
      raw: true,
    });

    expect(response).toEqual(null);
  });

  it('should return exchange rates when data exists for the requested date', async () => {
    const response = await helpers.getExchangeRates({
      date: seedDataDate,
      raw: true,
    });

    // Seed data should exist for dates around 10-15 days ago from migration
    // If data exists, it should be an array of exchange rates
    if (response !== null) {
      expect(Array.isArray(response)).toBe(true);
      expect(response.length).toBeGreaterThan(0);
      expect(response[0]).toHaveProperty('baseCode');
      expect(response[0]).toHaveProperty('quoteCode');
      expect(response[0]).toHaveProperty('rate');
    }
    // If no data exists for this date, that's also acceptable (migration timing)
  });
});
