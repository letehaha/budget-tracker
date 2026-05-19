import { CATEGORY_TYPES, type RecordId } from '@bt/shared/types';

import { buildCategiesObjectGraph } from './format-categories.helper';

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

const category = (id: number) => ({
  id: uuid(id) as RecordId,
  key: null,
  color: '',
  name: 'test',
  icon: null,
  userId: 1,
  parentId: null as RecordId | null,
  type: CATEGORY_TYPES.custom,
});

describe('Categories formatting helper', () => {
  test.each([
    ['empty arrays', [], []],

    ['single category', [category(1)], [{ ...category(1), subCategories: [] }]],

    [
      'nested categories',
      [
        category(1),
        category(2),
        { ...category(3), parentId: uuid(2) as RecordId },
        { ...category(4), parentId: uuid(3) as RecordId },
      ],
      [
        { ...category(1), subCategories: [] },
        {
          ...category(2),
          subCategories: [
            {
              ...category(3),
              parentId: uuid(2) as RecordId,
              subCategories: [
                {
                  ...category(4),
                  parentId: uuid(3) as RecordId,
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
