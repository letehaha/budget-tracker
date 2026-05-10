import Categories from '@models/categories.model';
import { getAccessibleCategoryOwnerIds } from '@services/sharing/auth/get-accessible-category-owner-ids.service';

/**
 * Minimal category shape used by stats/aggregation paths to build hierarchies and render
 * names/colors. Intentionally narrower than the full Categories row — these paths never
 * need `key`, `icon`, `type`, etc.
 */
export interface AccessibleCategoryInfo {
  id: number;
  name: string;
  color: string;
  parentId: number | null;
}

interface AccessibleCategoryMap {
  /** Flat list of every category visible to the caller (own + shared-account owners'). */
  categories: AccessibleCategoryInfo[];
  /** O(1) lookup by category id. Same instances as in `categories`. */
  byId: Map<number, AccessibleCategoryInfo>;
}

/**
 * Returns every category the caller can legitimately see in stats/lookup contexts: their
 * own + every owner of an account they have read access to. Recipients on a shared
 * account must reference the owner's category set (per `family-sharing-categories.md`),
 * so any read path that joins transactions to categories by `userId` would otherwise miss
 * those rows and render them as "Unknown" / black in the dashboard.
 *
 * Returns both the array and a `byId` map built once — most call sites need both (e.g.
 * walk parent links via the map, then iterate the array to find roots). One query, one
 * traversal.
 */
export const getAccessibleCategoryMap = async ({ userId }: { userId: number }): Promise<AccessibleCategoryMap> => {
  const ownerUserIds = await getAccessibleCategoryOwnerIds({ userId });

  // `raw: true` is safe here — Categories has no Money columns. Selecting only the four
  // fields stats paths actually use keeps the payload small.
  const rows = await Categories.findAll({
    where: { userId: ownerUserIds },
    attributes: ['id', 'name', 'color', 'parentId'],
    raw: true,
  });

  const categories: AccessibleCategoryInfo[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    parentId: row.parentId ?? null,
  }));

  const byId = new Map<number, AccessibleCategoryInfo>(categories.map((cat) => [cat.id, cat]));

  return { categories, byId };
};
