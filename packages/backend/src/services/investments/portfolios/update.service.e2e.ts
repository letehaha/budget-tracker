import { PORTFOLIO_TYPE } from '@bt/shared/types/investments';
import { describe, expect, it } from 'vitest';
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
    });

    describe('Error cases', () => {
      it('should return 404 when portfolio does not exist', async () => {
        const response = await helpers.updatePortfolio({
          portfolioId: 99999,
          payload: { name: 'New Name' },
        });

        expect(response.statusCode).toBe(ERROR_CODES.NotFoundError);
      });

      it('should return 409 when name conflicts with existing portfolio', async () => {
        // Create first portfolio
        const firstResponse = await helpers.createPortfolio({
          payload: { name: 'First Portfolio' },
        });
        expect(firstResponse.statusCode).toBe(200);

        // Create second portfolio
        const secondResponse = await helpers.createPortfolio({
          payload: { name: 'Second Portfolio' },
        });
        const secondPortfolio = helpers.extractResponse(secondResponse);

        // Try to update second portfolio with first portfolio's name
        const response = await helpers.updatePortfolio({
          portfolioId: secondPortfolio.id,
          payload: { name: 'First Portfolio' },
        });

        expect(response.statusCode).toBe(ERROR_CODES.ConflictError);
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

      it('should return ValidationError for invalid portfolioId parameter', async () => {
        const response = await helpers.updatePortfolio({
          portfolioId: 'invalid' as unknown as number,
          payload: { name: 'Test' },
        });

        expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
      });
    });
  });
});
