import type { FormattedCategory } from '@/common/types';

/** One category plus the subcategories that survived the current search. */
export interface ExcludableCategoryNode {
  category: FormattedCategory;
  children: ExcludableCategoryNode[];
}
