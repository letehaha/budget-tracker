import { type FormattedCategory } from '@/common/types';
import { CategoryModel } from '@bt/shared/types';

export const buildCategiesObjectGraph = (items: CategoryModel[]): FormattedCategory[] => {
  const itemsById: Record<string, FormattedCategory> = {};
  const roots: FormattedCategory[] = [];
  const tempItems: FormattedCategory[] = items.map((item) => {
    const tempItem: FormattedCategory = {
      ...item,
      subCategories: [],
    };
    // build an id->object mapping, so we don't have to go hunting for parents
    itemsById[item.id] = tempItem;

    return tempItem;
  });

  tempItems.forEach((item) => {
    const { parentId } = item;
    // if parentId is null, this is a root; otherwise, it's parentId's kid
    const nodes = !parentId ? roots : itemsById[parentId].subCategories;
    nodes.push(item);
  });

  return roots;
};
