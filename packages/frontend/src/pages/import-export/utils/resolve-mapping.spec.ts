import { describe, expect, it } from 'vitest';

import { computeAutoMatchEntries, computeCreateForUnresolved, computeExactLinkEntries } from './resolve-mapping';

// ---------------------------------------------------------------------------
// Minimal entry type used across all tests
//
// `label` carries the source name passed to the factory so tests can assert
// that the correct name flows through to the produced entry.
// ---------------------------------------------------------------------------

type Entry = { action: 'link-existing'; id: string; label: string } | { action: 'create-new'; label: string };

const toLink = (id: string, name: string): Entry => ({ action: 'link-existing', id, label: name });
const toCreate = (name: string): Entry => ({ action: 'create-new', label: name });

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const targets = [
  { id: 'id-groceries', name: 'Groceries' },
  { id: 'id-transport', name: 'Transport' },
  { id: 'id-bbva-uyu', name: 'BBVA Uruguay', currencyCode: 'UYU' },
  { id: 'id-bbva-ars', name: 'BBVA Argentina', currencyCode: 'ARS' },
];

// ---------------------------------------------------------------------------
// computeAutoMatchEntries
// ---------------------------------------------------------------------------

describe('computeAutoMatchEntries', () => {
  it('links matched source to its target id and carries the source name', () => {
    const result = computeAutoMatchEntries({
      sources: [{ name: 'Groceries' }],
      targets,
      current: {},
      overwrite: true,
      toLink,
      toCreate,
    });
    expect(result).toEqual({ Groceries: { action: 'link-existing', id: 'id-groceries', label: 'Groceries' } });
  });

  it('falls back to create-new when source has no match, carrying the source name', () => {
    const result = computeAutoMatchEntries({
      sources: [{ name: 'Unknown Merchant' }],
      targets,
      current: {},
      overwrite: true,
      toLink,
      toCreate,
    });
    expect(result).toEqual({ 'Unknown Merchant': { action: 'create-new', label: 'Unknown Merchant' } });
  });

  it('handles mix of matched and unmatched sources, each entry carries its own source name', () => {
    const result = computeAutoMatchEntries({
      sources: [{ name: 'Groceries' }, { name: 'Mystery' }],
      targets,
      current: {},
      overwrite: true,
      toLink,
      toCreate,
    });
    expect(result).toEqual({
      Groceries: { action: 'link-existing', id: 'id-groceries', label: 'Groceries' },
      Mystery: { action: 'create-new', label: 'Mystery' },
    });
  });

  it('overwrite: false — skips sources already present in current', () => {
    const current: Record<string, Entry> = {
      Groceries: { action: 'link-existing', id: 'id-groceries', label: 'Groceries' },
    };
    const result = computeAutoMatchEntries({
      sources: [{ name: 'Groceries' }, { name: 'Transport' }],
      targets,
      current,
      overwrite: false,
      toLink,
      toCreate,
    });
    // Groceries already has an entry → skipped; Transport is new → linked
    expect(result).toEqual({ Transport: { action: 'link-existing', id: 'id-transport', label: 'Transport' } });
    expect(result['Groceries']).toBeUndefined();
  });

  it('overwrite: true — re-matches sources already present in current', () => {
    const current: Record<string, Entry> = {
      Groceries: { action: 'create-new', label: 'Groceries' },
    };
    const result = computeAutoMatchEntries({
      sources: [{ name: 'Groceries' }],
      targets,
      current,
      overwrite: true,
      toLink,
      toCreate,
    });
    // Existing create-new overwritten with the correct link
    expect(result).toEqual({ Groceries: { action: 'link-existing', id: 'id-groceries', label: 'Groceries' } });
  });

  it('overwrite: false — does not include already-present source at all (preserves caller entry)', () => {
    const existingEntry: Entry = { action: 'link-existing', id: 'old-id', label: 'Groceries' };
    const current: Record<string, Entry> = { Groceries: existingEntry };
    const result = computeAutoMatchEntries({
      sources: [{ name: 'Groceries' }],
      targets,
      current,
      overwrite: false,
      toLink,
      toCreate,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('empty sources → empty result', () => {
    const result = computeAutoMatchEntries({
      sources: [],
      targets,
      current: {},
      overwrite: true,
      toLink,
      toCreate,
    });
    expect(result).toEqual({});
  });

  it('currency-aware: source with matching currencyCode links to the currency-matched target, carrying source name', () => {
    const result = computeAutoMatchEntries({
      sources: [{ name: 'BBVA Uruguay', currencyCode: 'UYU' }],
      targets,
      current: {},
      overwrite: true,
      toLink,
      toCreate,
    });
    expect(result).toEqual({
      'BBVA Uruguay': { action: 'link-existing', id: 'id-bbva-uyu', label: 'BBVA Uruguay' },
    });
  });

  it('currency-aware: source with non-matching currencyCode falls back to create-new with source name', () => {
    const result = computeAutoMatchEntries({
      sources: [{ name: 'BBVA Uruguay', currencyCode: 'ARS' }],
      targets,
      current: {},
      overwrite: true,
      toLink,
      toCreate,
    });
    // Name matches id-bbva-uyu but currency doesn't → no link
    expect(result).toEqual({ 'BBVA Uruguay': { action: 'create-new', label: 'BBVA Uruguay' } });
  });

  it('currency-aware: source without currencyCode matches name regardless of target currency', () => {
    const result = computeAutoMatchEntries({
      sources: [{ name: 'BBVA Uruguay' }],
      targets,
      current: {},
      overwrite: true,
      toLink,
      toCreate,
    });
    expect(result).toEqual({
      'BBVA Uruguay': { action: 'link-existing', id: 'id-bbva-uyu', label: 'BBVA Uruguay' },
    });
  });
});

// ---------------------------------------------------------------------------
// computeExactLinkEntries
// ---------------------------------------------------------------------------

describe('computeExactLinkEntries', () => {
  it('returns link entries only for matched sources, each carrying its source name', () => {
    const result = computeExactLinkEntries({
      sources: [{ name: 'Groceries' }, { name: 'Transport' }],
      targets,
      toLink,
    });
    expect(result).toEqual({
      Groceries: { action: 'link-existing', id: 'id-groceries', label: 'Groceries' },
      Transport: { action: 'link-existing', id: 'id-transport', label: 'Transport' },
    });
  });

  it('omits unmatched sources entirely (existing entries preserved by caller)', () => {
    const result = computeExactLinkEntries({
      sources: [{ name: 'Groceries' }, { name: 'Ghost' }],
      targets,
      toLink,
    });
    expect(result).toEqual({
      Groceries: { action: 'link-existing', id: 'id-groceries', label: 'Groceries' },
    });
    expect(result['Ghost']).toBeUndefined();
  });

  it('returns empty object when no source matches', () => {
    const result = computeExactLinkEntries({
      sources: [{ name: 'Alpha' }, { name: 'Beta' }],
      targets,
      toLink,
    });
    expect(result).toEqual({});
  });

  it('returns empty object for empty sources', () => {
    const result = computeExactLinkEntries({ sources: [], targets, toLink });
    expect(result).toEqual({});
  });

  it('is case-insensitive (mirrors matchValuesByName behaviour) and carries the original source name', () => {
    const result = computeExactLinkEntries({
      sources: [{ name: 'groceries' }],
      targets,
      toLink,
    });
    // Key is the original source name; label reflects it too
    expect(result).toEqual({ groceries: { action: 'link-existing', id: 'id-groceries', label: 'groceries' } });
  });

  it('currency-aware: links to the same-named target whose currency matches, carrying source name', () => {
    const result = computeExactLinkEntries({
      sources: [{ name: 'BBVA Uruguay', currencyCode: 'UYU' }],
      targets,
      toLink,
    });
    expect(result['BBVA Uruguay']).toEqual({ action: 'link-existing', id: 'id-bbva-uyu', label: 'BBVA Uruguay' });
  });

  it('currency-aware: omits a source whose currency matches no same-named target', () => {
    const result = computeExactLinkEntries({
      sources: [{ name: 'BBVA Uruguay', currencyCode: 'ARS' }],
      targets,
      toLink,
    });
    // The only 'BBVA Uruguay' target is UYU, so an ARS source can't link to it.
    expect(result['BBVA Uruguay']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computeCreateForUnresolved
// ---------------------------------------------------------------------------

describe('computeCreateForUnresolved', () => {
  // Simple resolved/unresolved predicates for the tests
  const isUnresolved = (entry: Entry | undefined): boolean => {
    if (entry === undefined) return true;
    if (entry.action === 'link-existing') return false;
    // create-new is considered unresolved (no target chosen yet)
    return true;
  };

  it('returns create-new for names where isUnresolved is true (no current entry), embedding source name in each entry', () => {
    const result = computeCreateForUnresolved({
      names: ['Alpha', 'Beta'],
      current: {},
      isUnresolved,
      toCreate,
    });
    expect(result).toEqual({
      Alpha: { action: 'create-new', label: 'Alpha' },
      Beta: { action: 'create-new', label: 'Beta' },
    });
  });

  it('omits names where isUnresolved is false (existing link-existing entry)', () => {
    const current: Record<string, Entry> = {
      Groceries: { action: 'link-existing', id: 'id-groceries', label: 'Groceries' },
    };
    const result = computeCreateForUnresolved({
      names: ['Groceries', 'Transport'],
      current,
      isUnresolved,
      toCreate,
    });
    // Groceries is resolved → omitted; Transport has no entry → create
    expect(result).toEqual({ Transport: { action: 'create-new', label: 'Transport' } });
    expect(result['Groceries']).toBeUndefined();
  });

  it('includes names that have a create-new entry (still unresolved per predicate)', () => {
    const current: Record<string, Entry> = {
      Alpha: { action: 'create-new', label: 'Alpha' },
    };
    const result = computeCreateForUnresolved({
      names: ['Alpha'],
      current,
      isUnresolved,
      toCreate,
    });
    expect(result).toEqual({ Alpha: { action: 'create-new', label: 'Alpha' } });
  });

  it('returns empty object when every name is resolved', () => {
    const current: Record<string, Entry> = {
      Groceries: { action: 'link-existing', id: 'id-groceries', label: 'Groceries' },
      Transport: { action: 'link-existing', id: 'id-transport', label: 'Transport' },
    };
    const result = computeCreateForUnresolved({
      names: ['Groceries', 'Transport'],
      current,
      isUnresolved,
      toCreate,
    });
    expect(result).toEqual({});
  });

  it('returns empty object for empty names list', () => {
    const result = computeCreateForUnresolved({
      names: [],
      current: {},
      isUnresolved,
      toCreate,
    });
    expect(result).toEqual({});
  });

  it('respects a custom isUnresolved predicate that considers undefined-only as unresolved', () => {
    const strictPredicate = (entry: Entry | undefined): boolean => entry === undefined;
    const current: Record<string, Entry> = {
      Alpha: { action: 'create-new', label: 'Alpha' },
    };
    const result = computeCreateForUnresolved({
      names: ['Alpha', 'Beta'],
      current,
      isUnresolved: strictPredicate,
      toCreate,
    });
    // Alpha has an entry (even create-new) → NOT unresolved under strict predicate
    // Beta has no entry → unresolved → create-new with its own name
    expect(result).toEqual({ Beta: { action: 'create-new', label: 'Beta' } });
    expect(result['Alpha']).toBeUndefined();
  });
});
