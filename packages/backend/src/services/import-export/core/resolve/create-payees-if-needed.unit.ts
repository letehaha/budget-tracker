import { generateRandomRecordId } from '@common/lib/record-id-helpers';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConflictError, ValidationError } from '@js/errors';

// ── Mocks (hoisted before importing the module under test) ──────────────────

// Stub resolveNormalizedName — drives the reuse-vs-create decision. Each test
// queues the namespace hit (canonical/alias) or `null` it wants per name.
const resolveNormalizedName =
  jest.fn<
    (args: {
      userId: number;
      normalized: string;
    }) => Promise<{ payeeId: string; name: string; via: 'canonical' | 'alias' } | null>
  >();
jest.mock('@services/payees/payee-namespace', () => ({
  __esModule: true,
  resolveNormalizedName: (args: { userId: number; normalized: string }) => resolveNormalizedName(args),
}));

// Stub createPayee — records every insert so tests assert which raw names were
// actually created (vs. reused from an existing Payee or alias).
const createPayee = jest.fn<(args: { userId: number; name: string }) => Promise<{ id: string }>>();
jest.mock('@services/payees/payees.service', () => ({
  __esModule: true,
  createPayee: (args: { userId: number; name: string }) => createPayee(args),
}));

// `normalizePayeeName` is NOT mocked: it's a pure, DB-free function, so the real
// one exercises the normalize-driven dedup end to end.

// eslint-disable-next-line import/first
import { createPayeesIfNeeded } from './create-payees-if-needed';

const USER_ID = 1;

beforeEach(() => {
  resolveNormalizedName.mockReset();
  createPayee.mockReset();
  // Default: nothing in the namespace; each create returns a fresh id.
  resolveNormalizedName.mockResolvedValue(null);
  createPayee.mockImplementation(async () => ({ id: generateRandomRecordId() }));
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('createPayeesIfNeeded', () => {
  it('creates a Payee when the name is not yet in the namespace', async () => {
    const createdId = generateRandomRecordId();
    resolveNormalizedName.mockResolvedValueOnce(null);
    createPayee.mockResolvedValueOnce({ id: createdId });

    const { payeeNameToId, payeesCreated } = await createPayeesIfNeeded({
      userId: USER_ID,
      payeeNames: ['Amazon'],
    });

    expect(payeeNameToId.get('Amazon')).toBe(createdId);
    expect(payeesCreated).toBe(1);
    expect(createPayee).toHaveBeenCalledTimes(1);
    expect(createPayee).toHaveBeenCalledWith({ userId: USER_ID, name: 'Amazon' });
  });

  it('reuses an existing Payee matched by canonical normalized name without creating', async () => {
    const existingId = generateRandomRecordId();
    // Source string "amazon" (lowercased) resolves to a Payee whose canonical
    // name is "Amazon".
    resolveNormalizedName.mockResolvedValueOnce({ payeeId: existingId, name: 'Amazon', via: 'canonical' });

    const { payeeNameToId, payeesCreated } = await createPayeesIfNeeded({
      userId: USER_ID,
      payeeNames: ['amazon'],
    });

    expect(payeeNameToId.get('amazon')).toBe(existingId);
    expect(payeesCreated).toBe(0);
    expect(createPayee).not.toHaveBeenCalled();
  });

  it('reuses an existing Payee matched via an alias without creating', async () => {
    const aliasedPayeeId = generateRandomRecordId();
    // The raw string never matches a canonical name, but resolves through a
    // user-curated alias to an existing Payee.
    resolveNormalizedName.mockResolvedValueOnce({ payeeId: aliasedPayeeId, name: 'Amazon', via: 'alias' });

    const { payeeNameToId, payeesCreated } = await createPayeesIfNeeded({
      userId: USER_ID,
      payeeNames: ['AMZN Mktp'],
    });

    expect(payeeNameToId.get('AMZN Mktp')).toBe(aliasedPayeeId);
    expect(payeesCreated).toBe(0);
    expect(createPayee).not.toHaveBeenCalled();
  });

  it('dedupes raw strings that normalize equal: one create, both keys map to it', async () => {
    const createdId = generateRandomRecordId();
    resolveNormalizedName.mockResolvedValue(null);
    createPayee.mockResolvedValueOnce({ id: createdId });

    // "Amazon" and "AMAZON  " both normalize to "amazon".
    const { payeeNameToId, payeesCreated } = await createPayeesIfNeeded({
      userId: USER_ID,
      payeeNames: ['Amazon', 'AMAZON  '],
    });

    expect(payeeNameToId.get('Amazon')).toBe(createdId);
    expect(payeeNameToId.get('AMAZON  ')).toBe(createdId);
    expect(payeesCreated).toBe(1);
    expect(createPayee).toHaveBeenCalledTimes(1);
    // The first-seen raw string (trimmed) is used as the created display name.
    expect(createPayee).toHaveBeenCalledWith({ userId: USER_ID, name: 'Amazon' });
    // The namespace is consulted once — once per distinct normalized form.
    expect(resolveNormalizedName).toHaveBeenCalledTimes(1);
  });

  it('skips blank, whitespace-only, and punctuation-only names', async () => {
    const createdId = generateRandomRecordId();
    createPayee.mockResolvedValueOnce({ id: createdId });

    const { payeeNameToId, payeesCreated } = await createPayeesIfNeeded({
      userId: USER_ID,
      // '' and '   ' fail the trim check; '!!!' normalizes to nothing.
      payeeNames: ['', '   ', '!!!', 'Costco'],
    });

    expect(payeeNameToId.has('')).toBe(false);
    expect(payeeNameToId.has('   ')).toBe(false);
    expect(payeeNameToId.has('!!!')).toBe(false);
    expect(payeeNameToId.get('Costco')).toBe(createdId);
    expect(payeesCreated).toBe(1);
    expect(createPayee).toHaveBeenCalledTimes(1);
    expect(resolveNormalizedName).toHaveBeenCalledTimes(1);
  });

  it('throws ValidationError for a display name longer than the column limit and never creates', async () => {
    // Runs before the importers' per-row try/catch, so a raw Postgres reject
    // would nuke the whole batch — the up-front guard must fail fast instead.
    const tooLong = 'A'.repeat(201);
    resolveNormalizedName.mockResolvedValueOnce(null);

    await expect(createPayeesIfNeeded({ userId: USER_ID, payeeNames: [tooLong] })).rejects.toBeInstanceOf(
      ValidationError,
    );

    expect(createPayee).not.toHaveBeenCalled();
  });

  it('reuses the racing row when createPayee conflicts and re-resolve now hits, without counting it', async () => {
    const racedId = generateRandomRecordId();
    // Pre-check finds nothing, so the resolver attempts a create; the create
    // loses a TOCTOU race and throws; the recovery re-resolve now finds the row
    // a concurrent writer inserted.
    resolveNormalizedName.mockResolvedValueOnce(null);
    resolveNormalizedName.mockResolvedValueOnce({ payeeId: racedId, name: 'Amazon', via: 'canonical' });
    createPayee.mockRejectedValueOnce(new ConflictError({ message: 'duplicate' }));

    const { payeeNameToId, payeesCreated } = await createPayeesIfNeeded({
      userId: USER_ID,
      payeeNames: ['Amazon'],
    });

    expect(payeeNameToId.get('Amazon')).toBe(racedId);
    // We did not create it, so it must not be counted.
    expect(payeesCreated).toBe(0);
    expect(createPayee).toHaveBeenCalledTimes(1);
    expect(resolveNormalizedName).toHaveBeenCalledTimes(2);
  });
});
