import {
  buildSystemPrompt,
  buildUserMessage,
  formatCategoriesForPrompt,
  formatTransactionsForPrompt,
} from './prompt-builder';
import { CategoryForCategorization, TransactionForCategorization } from './types';

describe('prompt-builder', () => {
  describe('buildSystemPrompt', () => {
    it('returns a non-empty system prompt', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toBeTruthy();
      expect(typeof prompt).toBe('string');
    });

    it('includes key instructions about output format', () => {
      const prompt = buildSystemPrompt();

      expect(prompt).toContain('transactionId:categoryId');
      expect(prompt).toContain('OUTPUT FORMAT');
    });
  });

  describe('formatTransactionsForPrompt', () => {
    it('formats transactions with header row', () => {
      const transactions: TransactionForCategorization[] = [
        {
          id: 1,
          amount: -100,
          currencyCode: 'USD',
          accountName: 'Main Account',
          datetime: '2024-01-15T10:30:00Z',
          note: 'Coffee shop',
        },
      ];

      const result = formatTransactionsForPrompt(transactions);
      const lines = result.split('\n');

      expect(lines[0]).toBe('id|amount|currency|account|datetime|note');
      expect(lines[1]).toBe('1|-100|USD|Main Account|2024-01-15T10:30:00Z|Coffee shop');
    });

    it('handles multiple transactions', () => {
      const transactions: TransactionForCategorization[] = [
        {
          id: 1,
          amount: -50,
          currencyCode: 'USD',
          accountName: 'Checking',
          datetime: '2024-01-15T10:00:00Z',
          note: 'Groceries',
        },
        {
          id: 2,
          amount: -25,
          currencyCode: 'EUR',
          accountName: 'Savings',
          datetime: '2024-01-16T14:00:00Z',
          note: 'Restaurant',
        },
      ];

      const result = formatTransactionsForPrompt(transactions);
      const lines = result.split('\n');

      expect(lines).toHaveLength(3); // header + 2 transactions
    });

    it('handles null notes', () => {
      const transactions: TransactionForCategorization[] = [
        {
          id: 1,
          amount: -100,
          currencyCode: 'USD',
          accountName: 'Account',
          datetime: '2024-01-15T10:00:00Z',
          note: null,
        },
      ];

      const result = formatTransactionsForPrompt(transactions);

      expect(result).toContain('1|-100|USD|Account|2024-01-15T10:00:00Z|');
    });

    it('escapes pipe characters in notes', () => {
      const transactions: TransactionForCategorization[] = [
        {
          id: 1,
          amount: -100,
          currencyCode: 'USD',
          accountName: 'Account',
          datetime: '2024-01-15T10:00:00Z',
          note: 'Test|with|pipes',
        },
      ];

      const result = formatTransactionsForPrompt(transactions);

      expect(result).not.toContain('Test|with|pipes');
      expect(result).toContain('Test,with,pipes');
    });

    it('replaces newlines in notes', () => {
      const transactions: TransactionForCategorization[] = [
        {
          id: 1,
          amount: -100,
          currencyCode: 'USD',
          accountName: 'Account',
          datetime: '2024-01-15T10:00:00Z',
          note: 'Line1\nLine2',
        },
      ];

      const result = formatTransactionsForPrompt(transactions);

      expect(result).not.toContain('\nLine2');
      expect(result).toContain('Line1 Line2');
    });

    it('truncates long notes to 200 characters', () => {
      const longNote = 'A'.repeat(300);
      const transactions: TransactionForCategorization[] = [
        {
          id: 1,
          amount: -100,
          currencyCode: 'USD',
          accountName: 'Account',
          datetime: '2024-01-15T10:00:00Z',
          note: longNote,
        },
      ];

      const result = formatTransactionsForPrompt(transactions);
      const notePart = result.split('\n')[1]!.split('|')[5];

      expect(notePart).toHaveLength(200);
    });

    it('returns only header for empty transactions', () => {
      const result = formatTransactionsForPrompt([]);

      expect(result).toBe('id|amount|currency|account|datetime|note');
    });
  });

  describe('formatCategoriesForPrompt', () => {
    it('formats categories with header row', () => {
      const categories: CategoryForCategorization[] = [{ id: 1, parentId: null, name: 'Food' }];

      const result = formatCategoriesForPrompt(categories);
      const lines = result.split('\n');

      expect(lines[0]).toBe('id|parentId|name');
      expect(lines[1]).toBe('1||Food');
    });

    it('handles categories with parentId', () => {
      const categories: CategoryForCategorization[] = [
        { id: 1, parentId: null, name: 'Food' },
        { id: 2, parentId: 1, name: 'Restaurants' },
      ];

      const result = formatCategoriesForPrompt(categories);
      const lines = result.split('\n');

      expect(lines[1]).toBe('1||Food');
      expect(lines[2]).toBe('2|1|Restaurants');
    });

    it('returns only header for empty categories', () => {
      const result = formatCategoriesForPrompt([]);

      expect(result).toBe('id|parentId|name');
    });
  });

  describe('buildUserMessage', () => {
    it('combines categories and transactions sections', () => {
      const transactions: TransactionForCategorization[] = [
        {
          id: 1,
          amount: -50,
          currencyCode: 'USD',
          accountName: 'Checking',
          datetime: '2024-01-15T10:00:00Z',
          note: 'Coffee',
        },
      ];
      const categories: CategoryForCategorization[] = [{ id: 1, parentId: null, name: 'Food & Drinks' }];

      const result = buildUserMessage({ transactions, categories });

      expect(result).toContain('CATEGORIES:');
      expect(result).toContain('TRANSACTIONS:');
      expect(result).toContain('1||Food & Drinks');
      expect(result).toContain('1|-50|USD|Checking|2024-01-15T10:00:00Z|Coffee');
    });

    it('includes instruction at the end', () => {
      const result = buildUserMessage({ transactions: [], categories: [] });

      expect(result).toContain('Categorize each transaction');
      expect(result).toContain('transactionId:categoryId');
    });
  });
});
