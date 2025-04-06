import { CATEGORY_TYPES } from '@bt/shared/types';

import { buildCategiesObjectGraph } from './format-categories.helper';

const category = (id: number) => ({
  id,
  color: '',
  name: 'test',
  imageUrl: '',
  userId: 1,
  parentId: null,
  type: CATEGORY_TYPES.custom,
});

describe('Categories formatting helper', () => {
  test.each([
    ['empty arrays', [], []],

    ['single category', [category(1)], [{ ...category(1), subCategories: [] }]],

    [
      'nested categories',
      [category(1), category(2), { ...category(3), parentId: 2 }, { ...category(4), parentId: 3 }],
      [
        { ...category(1), subCategories: [] },
        {
          ...category(2),
          subCategories: [
            {
              ...category(3),
              parentId: 2,
              subCategories: [
                {
                  ...category(4),
                  parentId: 3,
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
