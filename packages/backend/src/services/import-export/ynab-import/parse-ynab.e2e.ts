import { describe, expect, it } from '@jest/globals';
import { ERROR_CODES } from '@js/errors';
import * as helpers from '@tests/helpers';

/**
 * The parser itself is exhaustively covered in `parse-ynab.unit.ts` — this
 * file only smoke-tests the HTTP wiring (controller → service → response
 * envelope). Per-rule cases (warnings, edge inputs, fixture structure) all
 * live in the unit test where they cost ~1ms each instead of a full Docker
 * stack roundtrip.
 */
describe('Parse YNAB endpoint', () => {
  it('routes a valid CSV through the controller and returns the parse result', async () => {
    const fileContent = helpers.loadYnabFixture('register-basic.csv');
    const { result } = await helpers.parseYnab({ payload: { fileContent }, raw: true });
    // Just confirm the response envelope shape matches the contract — the
    // unit test covers the rich parser semantics.
    expect(result.accounts.length).toBeGreaterThan(0);
    expect(result.dateRange).not.toBeNull();
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('surfaces parser validation errors as HTTP 422', async () => {
    const response = await helpers.parseYnab({ payload: { fileContent: '   ' } });
    expect(response.statusCode).toBe(ERROR_CODES.ValidationError);
  });
});
