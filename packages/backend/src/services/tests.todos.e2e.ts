import { describe, it } from 'vitest';

describe('todo tests', () => {
  it.todo('automatic transaction category detection based on MCC code. For now it works only for Mono transactions');
  it.todo(`when deleting account that has transfer transactions it deletes transactions, but doesnt handle transfers correctly.
  need or block account deletion if there's transfers inside, or do something under the hood`);
});
