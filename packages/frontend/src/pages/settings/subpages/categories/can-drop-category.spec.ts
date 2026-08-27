import { CATEGORY_TYPES } from '@bt/shared/types';

import { categoryDropError } from './can-drop-category';
import { category } from './test-fixtures';

const MAX_NESTING = 3;

describe('categoryDropError', () => {
  test('allows moving a leaf under an unrelated root', () => {
    expect(
      categoryDropError({
        dragged: category({ id: 1 }),
        target: category({ id: 2 }),
        targetDepth: 1,
        maxNesting: MAX_NESTING,
      }),
    ).toBeNull();
  });

  test('refuses dropping onto itself', () => {
    const dragged = category({ id: 1 });

    expect(categoryDropError({ dragged, target: dragged, targetDepth: 1, maxNesting: MAX_NESTING })).toBe('self');
  });

  test('refuses dropping onto own descendant', () => {
    const grandChild = category({ id: 3, parentId: 2 });
    const child = category({ id: 2, parentId: 1, subCategories: [grandChild] });
    const dragged = category({ id: 1, subCategories: [child] });

    expect(categoryDropError({ dragged, target: child, targetDepth: 2, maxNesting: MAX_NESTING })).toBe(
      'inside-itself',
    );
    expect(categoryDropError({ dragged, target: grandChild, targetDepth: 3, maxNesting: MAX_NESTING })).toBe(
      'inside-itself',
    );
  });

  test('reports a target that cannot take any child as too deep', () => {
    expect(
      categoryDropError({
        dragged: category({ id: 1 }),
        target: category({ id: 3, parentId: 4 }),
        targetDepth: 3,
        maxNesting: MAX_NESTING,
      }),
    ).toBe('too-deep');
  });

  test('blames the dragged subtree when the target itself could take a leaf', () => {
    const dragged = category({ id: 1, subCategories: [category({ id: 2, parentId: 1 })] });

    expect(
      categoryDropError({ dragged, target: category({ id: 3, parentId: 4 }), targetDepth: 2, maxNesting: MAX_NESTING }),
    ).toBe('children-too-deep');
  });

  test('allows a move that lands exactly on the nesting limit', () => {
    const dragged = category({ id: 1, subCategories: [category({ id: 2, parentId: 1 })] });

    expect(
      categoryDropError({ dragged, target: category({ id: 3 }), targetDepth: 1, maxNesting: MAX_NESTING }),
    ).toBeNull();
  });

  test('refuses internal categories as targets', () => {
    expect(
      categoryDropError({
        dragged: category({ id: 1 }),
        target: category({ id: 2, type: CATEGORY_TYPES.internal }),
        targetDepth: 1,
        maxNesting: MAX_NESTING,
      }),
    ).toBe('internal-target');
  });

  test('refuses dropping onto the current parent', () => {
    expect(
      categoryDropError({
        dragged: category({ id: 2, parentId: 1 }),
        target: category({ id: 1, subCategories: [category({ id: 2, parentId: 1 })] }),
        targetDepth: 1,
        maxNesting: MAX_NESTING,
      }),
    ).toBe('current-parent');
  });

  test('allows moving a nested category to the top level', () => {
    expect(
      categoryDropError({ dragged: category({ id: 2, parentId: 1 }), target: null, maxNesting: MAX_NESTING }),
    ).toBeNull();
  });

  test('refuses moving an already-root category to the top level', () => {
    expect(categoryDropError({ dragged: category({ id: 1 }), target: null, maxNesting: MAX_NESTING })).toBe(
      'already-top-level',
    );
  });
});
