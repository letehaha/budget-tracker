import { beforeAll, describe, expect, it } from '@jest/globals';
import ExchangeRates from '@models/ExchangeRates.model';
import { createOverride } from '@tests/mocks/helpers';
import { format } from 'date-fns';

import { FRANKFURTER_ENDPOINT_REGEX } from './fetch-exchange-rates-for-date';
import { initializeHistoricalRates } from './initialize-historical-rates.service';

describe('Initialize Historical Rates Service', () => {
  let frankfurterOverride: ReturnType<typeof createOverride>;

  beforeAll(() => {
    frankfurterOverride = createOverride(global.mswMockServer, FRANKFURTER_ENDPOINT_REGEX);
  });

  it('should successfully load historical rates on initialization', async () => {
    // Clear any existing rates
    await ExchangeRates.destroy({ where: {} });

    // Call the initialization service
    await initializeHistoricalRates();

    // Verify rates were loaded
    const rates = await ExchangeRates.findAll({ raw: true });
    expect(rates.length).toBeGreaterThan(0);

    // Verify data structure
    rates.forEach((rate) => {
      expect(rate).toMatchObject({
        baseCode: expect.any(String),
        quoteCode: expect.any(String),
        rate: expect.any(Number),
        date: expect.any(Date),
      });
      expect(rate.baseCode).toBe('USD');
    });
  });

  it('should be idempotent - running twice should not duplicate data', async () => {
    // Clear any existing rates
    await ExchangeRates.destroy({ where: {} });

    // First run
    await initializeHistoricalRates();
    const firstRunCount = await ExchangeRates.count();
    expect(firstRunCount).toBeGreaterThan(0);

    // Second run - should not add duplicates
    await initializeHistoricalRates();
    const secondRunCount = await ExchangeRates.count();
    expect(secondRunCount).toBe(firstRunCount);
  });

  it('should handle Frankfurt service 500 error gracefully without crashing', async () => {
    // Make Frankfurt return 500 error
    frankfurterOverride.setOneTimeOverride({ status: 500 });

    // Should not throw - just log error
    await expect(initializeHistoricalRates()).resolves.toBeUndefined();
  });

  it('should handle Frankfurt service 404 error gracefully', async () => {
    // Make Frankfurt return 404 error
    frankfurterOverride.setOneTimeOverride({ status: 404 });

    // Should not throw - just log error
    await expect(initializeHistoricalRates()).resolves.toBeUndefined();
  });

  it('should handle invalid Frankfurt response gracefully', async () => {
    // Return invalid response (missing rates)
    frankfurterOverride.setOneTimeOverride({
      body: { base: 'USD', start_date: '1999-01-04', end_date: '2025-01-01' },
    });

    // Should not throw - just log error
    await expect(initializeHistoricalRates()).resolves.toBeUndefined();
  });

  it('should load rates from start date (1999-01-04) to current date', async () => {
    // Clear any existing rates
    await ExchangeRates.destroy({ where: {} });

    await initializeHistoricalRates();

    const rates = await ExchangeRates.findAll({
      attributes: ['date'],
      group: ['date'],
      raw: true,
    });

    // Should have at least 2 unique dates (start and end from our mock)
    expect(rates.length).toBeGreaterThanOrEqual(2);

    const dates = rates.map((r) => r.date);
    const startDateStr = '1999-01-04';

    // Check if rates include the start date (from mock)
    const hasStartDate = dates.some((date) => format(new Date(date), 'yyyy-MM-dd') === startDateStr);
    expect(hasStartDate).toBe(true);
  });

  it('should correctly save all rate fields to database', async () => {
    // Clear any existing rates
    await ExchangeRates.destroy({ where: {} });

    await initializeHistoricalRates();

    const sampleRate = await ExchangeRates.findOne({ raw: true });
    expect(sampleRate).toBeTruthy();
    expect(sampleRate!.baseCode).toBe('USD');
    expect(sampleRate!.quoteCode).toMatch(/^[A-Z]{3}$/); // 3-letter currency code
    expect(sampleRate!.rate).toBeGreaterThan(0);
    expect(sampleRate!.date).toBeInstanceOf(Date);
  });

  it('should work as a fire-and-forget operation (non-blocking startup pattern)', async () => {
    // Clear any existing rates
    await ExchangeRates.destroy({ where: {} });

    // Simulate startup pattern - call without await
    const promise = initializeHistoricalRates();

    // This simulates that the app continues to start up
    // The function should be running in background
    expect(promise).toBeInstanceOf(Promise);

    // Wait for it to complete (in real app, this happens in background)
    await promise;

    // Verify it still loaded data
    const count = await ExchangeRates.count();
    expect(count).toBeGreaterThan(0);
  });

  it('should not crash the app even if initialization fails (fire-and-forget safety)', async () => {
    // Make Frankfurt return error
    frankfurterOverride.setOneTimeOverride({ status: 500 });

    // Call without await - simulating startup
    const promise = initializeHistoricalRates();

    // Should not throw
    await expect(promise).resolves.toBeUndefined();

    // App should continue running normally (no crash)
    expect(true).toBe(true);
  });
});
