import { CATEGORY_TYPES } from '@bt/shared/types';

import { type ParentOption, buildParentOptions } from './parent-options';
import { category } from './test-fixtures';

// root-1 > child-2 > grandchild-3; root-4 > child-5; internal-6
const grandChild = category({ id: 3, parentId: 2 });
const child = category({ id: 2, parentId: 1, subCategories: [grandChild] });
const rootWithDepth = category({ id: 1, subCategories: [child] });
const otherChild = category({ id: 5, parentId: 4 });
const otherRoot = category({ id: 4, subCategories: [otherChild] });
const internalRoot = category({ id: 6, type: CATEGORY_TYPES.internal });
const tree = [rootWithDepth, otherRoot, internalRoot];

const optionIds = (options: ReturnType<typeof buildParentOptions>) =>
  options.map((o) => (o.kind === 'category' ? o.category.id : null));

describe('buildParentOptions', () => {
  test('pins the top-level option first', () => {
    const options = buildParentOptions({ categoryId: grandChild.id, tree, maxNesting: 3 });

    expect(options[0]).toEqual({ kind: 'top-level' });
  });

  test('hides the category itself, its descendants, and system categories', () => {
    const options = buildParentOptions({ categoryId: child.id, tree, maxNesting: 3 });

    const ids = optionIds(options);
    expect(ids).not.toContain(child.id);
    expect(ids).not.toContain(grandChild.id);
    expect(ids).not.toContain(internalRoot.id);
  });

  test('keeps the current parent listed', () => {
    const options = buildParentOptions({ categoryId: grandChild.id, tree, maxNesting: 3 });

    expect(optionIds(options)).toContain(child.id);
  });

  test('hides a parent whose depth cannot take any child', () => {
    const options = buildParentOptions({ categoryId: otherChild.id, tree, maxNesting: 3 });

    expect(optionIds(options)).not.toContain(grandChild.id);
  });

  test('hides a parent that fits itself but not the dragged subtree, keeping valid ones', () => {
    const options = buildParentOptions({ categoryId: child.id, tree, maxNesting: 3 });

    const ids = optionIds(options);
    expect(ids).not.toContain(otherChild.id);
    expect(ids).toContain(otherRoot.id);
  });

  test('leaves only the top-level option for a full-depth tree', () => {
    const options = buildParentOptions({ categoryId: rootWithDepth.id, tree, maxNesting: 3 });

    expect(optionIds(options)).toEqual([null]);
  });

  test('for a new category, hides only system categories and full-depth parents', () => {
    const options = buildParentOptions({ categoryId: null, tree, maxNesting: 3 });

    expect(optionIds(options)).toEqual([null, rootWithDepth.id, child.id, otherRoot.id, otherChild.id]);
  });

  test('treats an id missing from the tree like a new category', () => {
    const options = buildParentOptions({ categoryId: category({ id: 99 }).id, tree, maxNesting: 3 });

    expect(optionIds(options)).toEqual([null, rootWithDepth.id, child.id, otherRoot.id, otherChild.id]);
  });

  test('resolves the moved category from the tree, so depth math uses the same graph', () => {
    // `otherRoot` in the tree has a child (height 2), so a depth-2 destination must be hidden
    // even though a detached copy of the node would claim it is childless.
    const options = buildParentOptions({ categoryId: otherRoot.id, tree, maxNesting: 3 });

    expect(optionIds(options)).not.toContain(child.id);
  });

  test('reports depth so the picker can indent nested options', () => {
    const options = buildParentOptions({ categoryId: otherChild.id, tree, maxNesting: 3 }).filter(
      (o): o is Extract<ParentOption, { kind: 'category' }> => o.kind === 'category',
    );

    expect(options.find((o) => o.category.id === rootWithDepth.id)?.depth).toBe(1);
    expect(options.find((o) => o.category.id === child.id)?.depth).toBe(2);
  });
});
