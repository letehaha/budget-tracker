import { describe, expect, it } from 'vitest';

import { filterAutocompleteSuggestions } from './autocomplete-suggestions';

const SUGGESTIONS = ['claude-sonnet-5', 'claude-haiku-5', 'claude-opus-legacy', 'text-embedding'];

describe('filterAutocompleteSuggestions', () => {
  it('keeps every suggestion, in order, for an empty query', () => {
    expect(filterAutocompleteSuggestions({ suggestions: SUGGESTIONS, query: '  ' })).toEqual(SUGGESTIONS);
  });

  it('matches a case-insensitive substring', () => {
    expect(filterAutocompleteSuggestions({ suggestions: SUGGESTIONS, query: 'HAIKU' })).toEqual([
      'HAIKU',
      'claude-haiku-5',
    ]);
  });

  it('leads with the trimmed typed text only when it matches suggestions without equalling one', () => {
    expect(filterAutocompleteSuggestions({ suggestions: ['llama3.2'], query: ' llama3 ' })).toEqual([
      'llama3',
      'llama3.2',
    ]);
    expect(filterAutocompleteSuggestions({ suggestions: SUGGESTIONS, query: 'claude-haiku-5' })).toEqual([
      'claude-haiku-5',
    ]);
    expect(filterAutocompleteSuggestions({ suggestions: SUGGESTIONS, query: 'nothing-matches' })).toEqual([]);
  });

  it('returns nothing for no suggestions', () => {
    expect(filterAutocompleteSuggestions({ suggestions: [], query: '' })).toEqual([]);
    expect(filterAutocompleteSuggestions({ suggestions: [], query: 'llama' })).toEqual([]);
  });
});
