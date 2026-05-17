import { CATEGORY_TYPES } from '@bt/shared/types';

import { buildCategiesObjectGraph } from './format-categories.helper';

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const category = (id: number) => ({
  id: uuid(id),
  key: null,
  color: '',
  name: 'test',
  icon: null,
  userId: 1,
  parentId: null as string | null,
  type: CATEGORY_TYPES.custom,
});

describe('Categories formatting helper', () => {
  test.each([
    ['empty arrays', [], []],

    ['single category', [category(1)], [{ ...category(1), subCategories: [] }]],

    [
      'nested categories',
      [category(1), category(2), { ...category(3), parentId: uuid(2) }, { ...category(4), parentId: uuid(3) }],
      [
        { ...category(1), subCategories: [] },
        {
          ...category(2),
          subCategories: [
            {
              ...category(3),
              parentId: uuid(2),
              subCategories: [
                {
                  ...category(4),
                  parentId: uuid(3),
                  subCategories: [],
                },
              ],
            },
          ],
        },
      ],
    ],
  ])('%s', (description, value, expected) => {
    expect(buildCategiesObjectGraph(value)).toStrictEqual(expected);
  });
});
