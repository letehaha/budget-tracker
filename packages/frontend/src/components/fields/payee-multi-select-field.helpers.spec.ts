import type { RecordId } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { type SelectedPayee, hydrateSelectedPayees } from './payee-multi-select-field.helpers';

const payee = (id: string, name: string, logoDomain: string | null = null): SelectedPayee => ({
  id: id as RecordId,
  name,
  logoDomain,
});

describe('hydrateSelectedPayees', () => {
  it('replaces an id-placeholder name once the lookup resolves it (saved-view restore)', () => {
    // A restored selection starts with name === id because no source has resolved it yet.
    const selected = [payee('019ea731-0e4e', '019ea731-0e4e')];
    const lookup = new Map([['019ea731-0e4e', { name: 'Glovo', logoDomain: 'glovoapp.com' }]]);

    const result = hydrateSelectedPayees({ selected, lookup });

    expect(result[0]).toEqual(payee('019ea731-0e4e', 'Glovo', 'glovoapp.com'));
  });

  it('keeps object identity for rows the lookup does not resolve', () => {
    const row = payee('missing', 'missing');
    const result = hydrateSelectedPayees({ selected: [row], lookup: new Map() });

    expect(result[0]).toBe(row);
  });

  it('keeps object identity when name and logo are unchanged', () => {
    const row = payee('a', 'Amazon', 'amazon.com');
    const lookup = new Map([['a', { name: 'Amazon', logoDomain: 'amazon.com' }]]);

    const result = hydrateSelectedPayees({ selected: [row], lookup });

    expect(result[0]).toBe(row);
  });

  it('normalizes an undefined lookup logo to null', () => {
    const row = payee('a', 'a', null);
    const lookup = new Map([['a', { name: 'Amazon', logoDomain: null }]]);

    const result = hydrateSelectedPayees({ selected: [row], lookup });

    expect(result[0]).toEqual(payee('a', 'Amazon', null));
  });
});
