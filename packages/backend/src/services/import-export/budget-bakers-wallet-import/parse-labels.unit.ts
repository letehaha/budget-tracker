import { describe, expect, it } from '@jest/globals';

import { parseBudgetBakersWalletLabels } from './parse-labels';

describe('parseBudgetBakersWalletLabels', () => {
  it('returns an empty array for blank or nullish cells', () => {
    expect(parseBudgetBakersWalletLabels({ raw: '' })).toEqual([]);
    expect(parseBudgetBakersWalletLabels({ raw: '   ' })).toEqual([]);
    expect(parseBudgetBakersWalletLabels({ raw: null })).toEqual([]);
    expect(parseBudgetBakersWalletLabels({ raw: undefined })).toEqual([]);
  });

  it('returns a single label as a one-element array', () => {
    expect(parseBudgetBakersWalletLabels({ raw: 'Recompensas' })).toEqual(['Recompensas']);
  });

  it('splits a comma-separated cell into distinct labels (real Wallet format)', () => {
    expect(parseBudgetBakersWalletLabels({ raw: 'Maru, Ahorro' })).toEqual(['Maru', 'Ahorro']);
    expect(parseBudgetBakersWalletLabels({ raw: 'Ramiro, Recompensas' })).toEqual(['Ramiro', 'Recompensas']);
  });

  it('trims each label and tolerates missing space after the comma', () => {
    expect(parseBudgetBakersWalletLabels({ raw: 'A,B' })).toEqual(['A', 'B']);
    expect(parseBudgetBakersWalletLabels({ raw: '  Travel ,  Refund ' })).toEqual(['Travel', 'Refund']);
  });

  it('drops empty segments from leading/trailing/double commas', () => {
    expect(parseBudgetBakersWalletLabels({ raw: 'Travel,' })).toEqual(['Travel']);
    expect(parseBudgetBakersWalletLabels({ raw: ',Travel' })).toEqual(['Travel']);
    expect(parseBudgetBakersWalletLabels({ raw: 'Travel,,Refund' })).toEqual(['Travel', 'Refund']);
  });

  it('de-duplicates repeated labels within a row, first occurrence wins', () => {
    expect(parseBudgetBakersWalletLabels({ raw: 'Ahorro, Ahorro' })).toEqual(['Ahorro']);
    expect(parseBudgetBakersWalletLabels({ raw: 'A, B, A' })).toEqual(['A', 'B']);
  });
});
