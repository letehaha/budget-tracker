import * as Categories from '@models/Categories.model';
import { endOfDay } from 'date-fns';
import { Op } from 'sequelize';

import { getUserSettings } from '../../user-settings/get-user-settings';

type ColumnName = 'time' | 'date';
interface DateQuery {
  // yyyy-mm-dd
  from?: string;
  // yyyy-mm-dd
  to?: string;
  columnName: ColumnName;
}

/**
 * Resolves all excluded category IDs for a user, including descendants
 * of any excluded parent categories.
 */
export async function getExcludedCategoryIds({ userId }: { userId: number }): Promise<number[]> {
  const settings = await getUserSettings({ userId });
  const excludedCategories = settings.stats.expenses.excludedCategories;

  if (excludedCategories.length === 0) return [];

  const allCategories = await Categories.default.findAll({
    where: { userId },
    attributes: ['id', 'parentId'],
    raw: true,
  });

  const excludedSet = new Set<number>(excludedCategories);

  for (const cat of allCategories) {
    let currentParentId: number | null = cat.parentId;
    while (currentParentId !== null) {
      if (excludedSet.has(currentParentId)) {
        excludedSet.add(cat.id);
        break;
      }
      const parent = allCategories.find((c) => c.id === currentParentId);
      currentParentId = parent?.parentId ?? null;
    }
  }

  return Array.from(excludedSet);
}

/**
 * Expands a list of category IDs to include all their descendant sub-categories.
 * Requires an already-loaded category list with id/parentId.
 */
export function expandCategoryIdsWithDescendants({
  categoryIds,
  allCategories,
}: {
  categoryIds: number[];
  allCategories: { id: number; parentId: number | null }[];
}): number[] {
  if (categoryIds.length === 0) return [];

  const categoryMap = new Map(allCategories.map((c) => [c.id, c]));
  const expandedSet = new Set<number>(categoryIds);

  for (const cat of allCategories) {
    let currentParentId: number | null = cat.parentId;
    while (currentParentId !== null) {
      if (expandedSet.has(currentParentId)) {
        expandedSet.add(cat.id);
        break;
      }
      const parent = categoryMap.get(currentParentId);
      currentParentId = parent?.parentId ?? null;
    }
  }

  return Array.from(expandedSet);
}

export const getWhereConditionForTime = ({ from, to, columnName }: DateQuery) => {
  const where: Partial<Record<ColumnName, Record<symbol, Date[] | Date>>> = {};

  if (from && to) {
    where[columnName] = {
      [Op.between]: [new Date(from), endOfDay(new Date(to))],
    };
  } else if (from) {
    where[columnName] = {
      [Op.gte]: new Date(from),
    };
  } else if (to) {
    where[columnName] = {
      [Op.lte]: new Date(to),
    };
  }

  return where;
};
