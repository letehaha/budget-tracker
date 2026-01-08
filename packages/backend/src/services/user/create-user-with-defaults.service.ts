import { requestContext } from '@common/request-context';
import { getTranslatedCategories } from '@js/const';
import * as categoriesService from '@services/categories.service';
import * as userService from '@services/user.service';

/**
 * Creates a new app user with default categories and subcategories.
 * This is the standard way to create a user - used by both the auth hook
 * (when a new user signs up) and the test setup.
 *
 * Categories are created in the user's locale (from Accept-Language header).
 */
export async function createUserWithDefaults({
  username,
  authUserId,
  locale: providedLocale,
}: {
  username: string;
  authUserId: string;
  locale?: string;
}) {
  // Get locale from parameter, AsyncLocalStorage, or default to 'en'
  const locale = providedLocale || requestContext.getLocale();

  // Get translated categories for the user's locale
  const translatedCategories = getTranslatedCategories({ locale });

  // Create the app user linked to the auth user
  const appUser = await userService.createUser({
    username,
    authUserId,
  });

  // Create default categories for the new user
  const defaultCategories = translatedCategories.main.map((item) => ({
    name: item.name,
    type: item.type,
    color: item.color,
    userId: appUser.id,
  }));

  const categories = await categoriesService.bulkCreate({ data: defaultCategories }, { returning: true });

  // Create a map of category key -> created category for subcategory matching
  const categoryKeyToId = new Map<string, { id: number; color: string }>();
  translatedCategories.main.forEach((item, index) => {
    const createdCategory = categories[index];
    if (createdCategory) {
      categoryKeyToId.set(item.key, { id: createdCategory.id, color: createdCategory.color });
    }
  });

  // Create subcategories
  const subcats: Array<{
    name: string;
    parentId: number;
    color: string;
    userId: number;
    type: string;
  }> = [];

  translatedCategories.subcategories.forEach((subcat) => {
    const parentCategory = categoryKeyToId.get(subcat.parentKey);

    if (parentCategory) {
      subcat.values.forEach((subItem) => {
        subcats.push({
          name: subItem.name,
          type: subItem.type,
          parentId: parentCategory.id,
          color: parentCategory.color,
          userId: appUser.id,
        });
      });
    }
  });

  if (subcats.length > 0) {
    await categoriesService.bulkCreate({ data: subcats });
  }

  // Set default category (the "Other" category)
  const defaultCategoryKey = translatedCategories.defaultCategoryKey;
  const defaultCategoryInfo = categoryKeyToId.get(defaultCategoryKey);

  if (defaultCategoryInfo) {
    await userService.updateUser({
      id: appUser.id,
      defaultCategoryId: defaultCategoryInfo.id,
    });
  }

  return appUser;
}
