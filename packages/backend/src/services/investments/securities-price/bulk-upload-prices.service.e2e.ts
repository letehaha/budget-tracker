import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import ExchangeRates from '@models/ExchangeRates.model';
import SecurityPricing from '@models/investments/SecurityPricing.model';
import { FRANKFURTER_START_DATE } from '@root/services/exchange-rates/frankfurter.service';
import * as helpers from '@tests/helpers';
import { startOfDay } from 'date-fns';
import { Op } from 'sequelize';

describe('POST /investments/securities/prices/bulk-upload', () => {
  let originalAdminUsers: string | undefined;

  beforeEach(async () => {
    // Save original ADMIN_USERS env var
    originalAdminUsers = process.env.ADMIN_USERS;
  });

  afterEach(() => {
    // Restore original ADMIN_USERS env var
    if (originalAdminUsers !== undefined) {
      process.env.ADMIN_USERS = originalAdminUsers;
    } else {
      delete process.env.ADMIN_USERS;
    }
  });

  describe('Authorization', () => {
    it('should reject request when ADMIN_USERS is not configured', async () => {
      delete process.env.ADMIN_USERS;

      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult: helpers.buildSecuritySearchResult(),
          prices: [{ price: 100, date: '2024-01-01', currency: 'USD' }],
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.Unauthorized);
    });

    it('should reject request from non-admin user', async () => {
      // Set a different user as admin (not test1)
      process.env.ADMIN_USERS = 'admin-user';

      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult: helpers.buildSecuritySearchResult(),
          prices: [{ price: 100, date: '2024-01-01', currency: 'USD' }],
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.Unauthorized);
    });

    it('should allow request from admin user', async () => {
      // test1 is configured as admin in beforeEach
      const searchResult = helpers.buildSecuritySearchResult();

      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult,
          prices: [{ price: 100, date: '2024-01-01', currency: 'USD' }],
        },
      });

      // Will fail validation (no exchange rates), but should pass authorization
      expect(response.statusCode).not.toBe(ERROR_CODES.Unauthorized);
    });
  });

  describe('Validation', () => {
    it('should validate required fields', async () => {
      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult: helpers.buildSecuritySearchResult(),
          prices: [],
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should validate price is positive', async () => {
      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult: helpers.buildSecuritySearchResult(),
          prices: [{ price: -100, date: '2024-01-01', currency: 'USD' }],
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should validate price is not too large', async () => {
      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult: helpers.buildSecuritySearchResult(),
          prices: [{ price: 1e13, date: '2024-01-01', currency: 'USD' }],
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should validate date format', async () => {
      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult: helpers.buildSecuritySearchResult(),
          prices: [{ price: 100, date: '01/01/2024', currency: 'USD' }],
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should validate currency code length', async () => {
      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult: helpers.buildSecuritySearchResult(),
          prices: [{ price: 100, date: '2024-01-01', currency: 'US' }],
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should reject when no exchange rates exist for currency', async () => {
      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult: helpers.buildSecuritySearchResult({ currencyCode: 'XYZ' }),
          prices: [{ price: 100, date: '2024-01-01', currency: 'XYZ' }],
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should reject when price currency does not match security currency', async () => {
      const searchResult = helpers.buildSecuritySearchResult({ currencyCode: 'USD' });

      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult,
          prices: [{ price: 100, date: '2024-01-01', currency: 'EUR' }],
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should reject when date is outside exchange rate range (without autoFilter)', async () => {
      const searchResult = helpers.buildSecuritySearchResult({ currencyCode: 'USD' });

      // Get the newest exchange rate to find a date beyond it
      const newestRate = await ExchangeRates.findOne({
        order: [['date', 'DESC']],
        attributes: ['date'],
        raw: true,
      });

      if (!newestRate) {
        throw new Error('No exchange rates found in test database');
      }

      // Date far in the future
      const futureDate = new Date(newestRate.date);
      futureDate.setFullYear(futureDate.getFullYear() + 10);
      const futureDateStr = futureDate.toISOString().split('T')[0]!;

      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult,
          prices: [{ price: 100, date: futureDateStr, currency: 'USD' }],
          autoFilter: false,
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should reject when all prices are filtered out with autoFilter', async () => {
      const searchResult = helpers.buildSecuritySearchResult({ currencyCode: 'USD' });

      // Get the newest exchange rate
      const newestRate = await ExchangeRates.findOne({
        order: [['date', 'DESC']],
        attributes: ['date'],
        raw: true,
      });

      if (!newestRate) {
        throw new Error('No exchange rates found in test database');
      }

      // Date far in the future
      const futureDate = new Date(newestRate.date);
      futureDate.setFullYear(futureDate.getFullYear() + 10);
      const futureDateStr = futureDate.toISOString().split('T')[0]!;

      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult,
          prices: [{ price: 100, date: futureDateStr, currency: 'USD' }],
          autoFilter: true,
        },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });
  });

  describe('Successful Upload', () => {
    it('should successfully upload prices for new security', async () => {
      const searchResult = helpers.buildSecuritySearchResult({
        symbol: 'TESTUPLOAD',
        name: 'Test Upload Security',
        currencyCode: 'USD',
      });

      // Get valid date for USD
      const exchangeRate = await ExchangeRates.findOne({
        where: {
          [Op.or]: [{ baseCode: 'USD' }, { quoteCode: 'USD' }],
        },
        order: [['date', 'DESC']],
        attributes: ['date'],
        raw: true,
      });

      if (!exchangeRate) {
        throw new Error('No exchange rates found for USD');
      }

      // Use the available date from the test DB
      const validDate = exchangeRate.date.toISOString().split('T')[0]!;

      // Only upload one price since test DB may only have one date with exchange rates
      const prices = [{ price: 100.5, date: validDate, currency: 'USD' }];

      const response = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult,
          prices,
        },
        raw: true,
      });

      expect(response.newOldestDate).toBeTruthy();
      expect(response.newNewestDate).toBeTruthy();
      expect(response.summary.inserted).toBe(1);
      expect(response.summary.duplicates).toBe(0);
      expect(response.summary.filtered).toBe(0);

      // Verify prices were actually inserted
      const securityPrices = await SecurityPricing.findAll({
        where: { source: 'manual-upload' },
        order: [['date', 'ASC']],
      });

      expect(securityPrices).toHaveLength(1);
      expect(Number(securityPrices[0]!.priceClose)).toBe(100.5);
    });

    it('should ignore duplicates when override is false', async () => {
      const searchResult = helpers.buildSecuritySearchResult({
        symbol: 'TESTDUP',
        name: 'Test Duplicate Security',
        currencyCode: 'USD',
      });

      const exchangeRate = await ExchangeRates.findOne({
        where: {
          [Op.or]: [{ baseCode: 'USD' }, { quoteCode: 'USD' }],
        },
        order: [['date', 'DESC']],
        attributes: ['date'],
        raw: true,
      });

      if (!exchangeRate) {
        throw new Error('No exchange rates found for USD');
      }

      const testDateStr = exchangeRate.date.toISOString().split('T')[0]!;

      const prices = [{ price: 100, date: testDateStr, currency: 'USD' }];

      // First upload
      const firstResponse = await helpers.bulkUploadSecurityPrices({
        payload: { searchResult, prices },
        raw: true,
      });

      expect(firstResponse.summary.inserted).toBe(1);
      expect(firstResponse.summary.duplicates).toBe(0);

      // Second upload with same date (should be ignored)
      const secondResponse = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult,
          prices: [{ price: 200, date: testDateStr, currency: 'USD' }],
          override: false,
        },
        raw: true,
      });

      expect(secondResponse.summary.inserted).toBe(0);
      expect(secondResponse.summary.duplicates).toBe(1);

      // Verify original price is unchanged
      const securityPrices = await SecurityPricing.findAll({
        where: { source: 'manual-upload' },
      });

      expect(securityPrices).toHaveLength(1);
      expect(Number(securityPrices[0]!.priceClose)).toBe(100);
    });

    it('should override duplicates when override is true', async () => {
      const searchResult = helpers.buildSecuritySearchResult({
        symbol: 'TESTOVERRIDE',
        name: 'Test Override Security',
        currencyCode: 'USD',
      });

      const exchangeRate = await ExchangeRates.findOne({
        where: {
          [Op.or]: [{ baseCode: 'USD' }, { quoteCode: 'USD' }],
        },
        order: [['date', 'DESC']],
        attributes: ['date'],
        raw: true,
      });

      if (!exchangeRate) {
        throw new Error('No exchange rates found for USD');
      }

      const testDateStr = exchangeRate.date.toISOString().split('T')[0]!;

      const prices = [{ price: 100, date: testDateStr, currency: 'USD' }];

      // First upload
      await helpers.bulkUploadSecurityPrices({
        payload: { searchResult, prices },
        raw: true,
      });

      // Second upload with override
      const secondResponse = await helpers.bulkUploadSecurityPrices({
        payload: {
          searchResult,
          prices: [{ price: 200, date: testDateStr, currency: 'USD' }],
          override: true,
        },
        raw: true,
      });

      expect(secondResponse.summary.inserted).toBe(0);
      expect(secondResponse.summary.duplicates).toBe(1);

      // Verify price was updated
      const securityPrices = await SecurityPricing.findAll({
        where: { source: 'manual-upload' },
      });

      expect(securityPrices).toHaveLength(1);
      expect(Number(securityPrices[0]!.priceClose)).toBe(200);
    });

    it.todo('should filter out-of-range dates when autoFilter is true');
    // const searchResult = helpers.buildSecuritySearchResult({
    //   symbol: 'TESTFILTER',
    //   name: 'Test Filter Security',
    //   currencyCode: 'USD',
    // });

    // const oldestRate = await ExchangeRates.findOne({
    //   where: {
    //     [Op.or]: [{ baseCode: 'USD' }, { quoteCode: 'USD' }],
    //   },
    //   order: [['date', 'ASC']],
    //   attributes: ['date'],
    //   raw: true,
    // });

    // const newestRate = await ExchangeRates.findOne({
    //   where: {
    //     [Op.or]: [{ baseCode: 'USD' }, { quoteCode: 'USD' }],
    //   },
    //   order: [['date', 'DESC']],
    //   attributes: ['date'],
    //   raw: true,
    // });

    // if (!oldestRate || !newestRate) {
    //   throw new Error('No exchange rates found for USD');
    // }

    // const validDate = new Date(oldestRate.date);
    // validDate.setDate(validDate.getDate() + 1);

    // const futureDate = new Date(newestRate.date);
    // futureDate.setFullYear(futureDate.getFullYear() + 10);

    // const prices = [
    //   { price: 100, date: validDate.toISOString().split('T')[0]!, currency: 'USD' },
    //   { price: 200, date: futureDate.toISOString().split('T')[0]!, currency: 'USD' },
    // ];

    // const response = await helpers.bulkUploadSecurityPrices({
    //   payload: {
    //     searchResult,
    //     prices,
    //     autoFilter: true,
    //   },
    //   // raw: true,
    // });

    // console.log('response', response);

    // expect(response.summary.inserted).toBe(1);
    // expect(response.summary.duplicates).toBe(0);
    // expect(response.summary.filtered).toBe(1);

    // // Verify only valid price was inserted
    // const securityPrices = await SecurityPricing.findAll({
    //   where: { source: 'manual-upload' },
    // });

    // expect(securityPrices).toHaveLength(1);
    // expect(Number(securityPrices[0]!.priceClose)).toBe(100);
    // });

    it.todo('should create security from search result if it does not exist');
  });
});

describe('POST /investments/securities/price-upload-info', () => {
  let originalAdminUsers: string | undefined;

  beforeEach(async () => {
    originalAdminUsers = process.env.ADMIN_USERS;
    process.env.ADMIN_USERS = 'test1';
  });

  afterEach(() => {
    if (originalAdminUsers !== undefined) {
      process.env.ADMIN_USERS = originalAdminUsers;
    } else {
      delete process.env.ADMIN_USERS;
    }
  });

  describe('Authorization', () => {
    it('should reject request when ADMIN_USERS is not configured', async () => {
      delete process.env.ADMIN_USERS;

      const response = await helpers.getPriceUploadInfo({
        payload: { currencyCode: 'USD' },
      });

      expect(response.statusCode).toBe(ERROR_CODES.Unauthorized);
    });

    it('should reject request from non-admin user', async () => {
      process.env.ADMIN_USERS = 'admin-user';

      const response = await helpers.getPriceUploadInfo({
        payload: { currencyCode: 'USD' },
      });

      expect(response.statusCode).toBe(ERROR_CODES.Unauthorized);
    });

    it('should allow request from admin user', async () => {
      const response = await helpers.getPriceUploadInfo({
        payload: { currencyCode: 'USD' },
      });

      expect(response.statusCode).not.toBe(ERROR_CODES.Unauthorized);
    });
  });

  describe('Validation', () => {
    it('should validate currency code length', async () => {
      const response = await helpers.getPriceUploadInfo({
        payload: { currencyCode: 'US' },
      });

      expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
    });

    it('should return error for currency with no exchange rates', async () => {
      const response = await helpers.getPriceUploadInfo({
        payload: { currencyCode: 'XYZ' },
      });

      expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
    });
  });

  describe('Success', () => {
    it('should return date range for valid currency', async () => {
      const response = await helpers.getPriceUploadInfo({
        payload: { currencyCode: 'USD' },
        raw: true,
      });

      expect(response.oldestDate).toBeTruthy();
      expect(response.newestDate).toBeTruthy();
      expect(response.currencyCode).toBe('USD');
      expect(startOfDay(new Date(response.minAllowedDate))).toEqual(startOfDay(FRANKFURTER_START_DATE));

      // Verify dates are in correct order
      expect(new Date(response.oldestDate).getTime()).toBeLessThanOrEqual(new Date(response.newestDate).getTime());
    });

    it('should return consistent date range across multiple calls', async () => {
      const firstResponse = await helpers.getPriceUploadInfo({
        payload: { currencyCode: 'USD' },
        raw: true,
      });

      const secondResponse = await helpers.getPriceUploadInfo({
        payload: { currencyCode: 'USD' },
        raw: true,
      });

      expect(firstResponse.oldestDate).toEqual(secondResponse.oldestDate);
      expect(firstResponse.newestDate).toEqual(secondResponse.newestDate);
    });
  });

  it.todo('works correctl when tries to update existing dates w/out override box enabled');
});
