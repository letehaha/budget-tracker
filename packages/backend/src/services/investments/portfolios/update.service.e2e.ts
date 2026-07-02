import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

describe('Update Portfolio Service E2E', () => {
  describe('PUT /investments/portfolios/:id', () => {
    describe('Success cases', () => {
      it('should perform multiple successful update operations', async () => {
        // Create a single portfolio for all update tests
        const createResponse = await helpers.createPortfolio({
          payload: { name: 'Test Portfolio', description: 'Initial description' },
        });
        const createdPortfolio = helpers.extractResponse(createResponse);

        // Test 1: Update portfolio name
        const nameUpdateResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { name: 'Updated Portfolio Name' },
        });

        expect(nameUpdateResponse.statusCode).toBe(200);
        const nameUpdatedPortfolio = helpers.extractResponse(nameUpdateResponse);
        expect(nameUpdatedPortfolio.name).toBe('Updated Portfolio Name');
        expect(nameUpdatedPortfolio.id).toBe(createdPortfolio.id);

        // Test 2: Update portfolio type
        const typeUpdateResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { portfolioType: PORTFOLIO_TYPE.retirement },
        });

        expect(typeUpdateResponse.statusCode).toBe(200);
        const typeUpdatedPortfolio = helpers.extractResponse(typeUpdateResponse);
        expect(typeUpdatedPortfolio.portfolioType).toBe(PORTFOLIO_TYPE.retirement);
        expect(typeUpdatedPortfolio.name).toBe('Updated Portfolio Name'); // Should retain previous update

        // Test 3: Update description
        const descUpdateResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { description: 'Updated description' },
        });

        expect(descUpdateResponse.statusCode).toBe(200);
        const descUpdatedPortfolio = helpers.extractResponse(descUpdateResponse);
        expect(descUpdatedPortfolio.description).toBe('Updated description');

        // Test 4: Update isEnabled status
        const enabledUpdateResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { isEnabled: false },
        });

        expect(enabledUpdateResponse.statusCode).toBe(200);
        const enabledUpdatedPortfolio = helpers.extractResponse(enabledUpdateResponse);
        expect(enabledUpdatedPortfolio.isEnabled).toBe(false);

        // Test 5: Update multiple fields at once
        const multiUpdateResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: {
            name: 'Multi-field Update',
            portfolioType: PORTFOLIO_TYPE.savings,
            description: 'Multi-field description',
            isEnabled: true,
          },
        });

        expect(multiUpdateResponse.statusCode).toBe(200);
        const multiUpdatedPortfolio = helpers.extractResponse(multiUpdateResponse);
        expect(multiUpdatedPortfolio.name).toBe('Multi-field Update');
        expect(multiUpdatedPortfolio.portfolioType).toBe(PORTFOLIO_TYPE.savings);
        expect(multiUpdatedPortfolio.description).toBe('Multi-field description');
        expect(multiUpdatedPortfolio.isEnabled).toBe(true);

        // Test 6: Set description to null
        const nullDescResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { description: null },
        });

        expect(nullDescResponse.statusCode).toBe(200);
        const nullDescPortfolio = helpers.extractResponse(nullDescResponse);
        expect(nullDescPortfolio.description).toBeNull();

        // Test 7: Update portfolio with its own name (should succeed)
        const sameNameResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { name: 'Multi-field Update' }, // Same as current name
        });

        expect(sameNameResponse.statusCode).toBe(200);
        const sameNamePortfolio = helpers.extractResponse(sameNameResponse);
        expect(sameNamePortfolio.name).toBe('Multi-field Update');
      });

      it('should set, uppercase, and reset displayCurrencyCode', async () => {
        const createResponse = await helpers.createPortfolio({
          payload: { name: 'Display Currency Portfolio' },
        });
        const createdPortfolio = helpers.extractResponse(createResponse);

        await helpers.addUserCurrencyByCode({ code: 'EUR', raw: true });

        // Lowercase input is normalized to the uppercase currency code
        const setResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { displayCurrencyCode: 'eur' },
        });

        expect(setResponse.statusCode).toBe(200);
        expect(helpers.extractResponse(setResponse).displayCurrencyCode).toBe('EUR');

        // Null resets back to the user's base currency
        const resetResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { displayCurrencyCode: null },
        });

        expect(resetResponse.statusCode).toBe(200);
        expect(helpers.extractResponse(resetResponse).displayCurrencyCode).toBeNull();
      });

      it('should keep displayCurrencyCode when updating unrelated fields', async () => {
        const createResponse = await helpers.createPortfolio({
          payload: { name: 'Sticky Display Currency Portfolio' },
        });
        const createdPortfolio = helpers.extractResponse(createResponse);

        await helpers.addUserCurrencyByCode({ code: 'EUR', raw: true });

        const setResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { displayCurrencyCode: 'EUR' },
        });
        expect(setResponse.statusCode).toBe(200);

        // An update payload without the displayCurrencyCode key must not reset it
        const nameUpdateResponse = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { name: 'Renamed Portfolio' },
        });

        expect(nameUpdateResponse.statusCode).toBe(200);
        const updatedPortfolio = helpers.extractResponse(nameUpdateResponse);
        expect(updatedPortfolio.name).toBe('Renamed Portfolio');
        expect(updatedPortfolio.displayCurrencyCode).toBe('EUR');
      });
    });

    describe('Error cases', () => {
      it('should return 404 when portfolio does not exist', async () => {
        const response = await helpers.updatePortfolio({
          portfolioId: generateRandomRecordId(),
          payload: { name: 'New Name' },
        });

        expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
      });

      it('allows updating a portfolio to a name another portfolio already uses', async () => {
        // Mirrors the create-side test — duplicate names are intentionally
        // permitted now (uniqueness constraint dropped in
        // 20260524000000-drop-portfolios-unique-name).
        const firstResponse = await helpers.createPortfolio({
          payload: { name: 'First Portfolio' },
        });
        expect(firstResponse.statusCode).toBe(200);

        const secondResponse = await helpers.createPortfolio({
          payload: { name: 'Second Portfolio' },
        });
        const secondPortfolio = helpers.extractResponse(secondResponse);

        const response = await helpers.updatePortfolio({
          portfolioId: secondPortfolio.id,
          payload: { name: 'First Portfolio' },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('Validation cases', () => {
      it('should return ValidationError when no fields are provided', async () => {
        const createResponse = await helpers.createPortfolio();
        const createdPortfolio = helpers.extractResponse(createResponse);

        const response = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: {},
        });

        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });

      it('should return ValidationError for invalid portfolio type', async () => {
        const createResponse = await helpers.createPortfolio();
        const createdPortfolio = helpers.extractResponse(createResponse);

        const response = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { portfolioType: 'invalid' as PORTFOLIO_TYPE },
        });

        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });

      it('should return ValidationError for empty name', async () => {
        const createResponse = await helpers.createPortfolio();
        const createdPortfolio = helpers.extractResponse(createResponse);

        const response = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { name: '' },
        });

        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });

      it('should return ValidationError for a display currency not connected to the user', async () => {
        const createResponse = await helpers.createPortfolio();
        const createdPortfolio = helpers.extractResponse(createResponse);

        const response = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { displayCurrencyCode: 'PLN' },
        });

        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });

      it('should return ValidationError for a malformed display currency code', async () => {
        const createResponse = await helpers.createPortfolio();
        const createdPortfolio = helpers.extractResponse(createResponse);

        const response = await helpers.updatePortfolio({
          portfolioId: createdPortfolio.id,
          payload: { displayCurrencyCode: 'EURO' },
        });

        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });

      it('should return ValidationError for invalid portfolioId parameter', async () => {
        const response = await helpers.updatePortfolio({
          portfolioId: 'invalid' as unknown as string,
          payload: { name: 'Test' },
        });

        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });
    });
  });
});
