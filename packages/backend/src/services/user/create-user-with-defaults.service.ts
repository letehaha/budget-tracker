import { DEFAULT_CATEGORIES } from '@js/const';
import * as categoriesService from '@services/categories.service';
import * as userService from '@services/user.service';

/**
 * Creates a new app user with default categories and subcategories.
 * This is the standard way to create a user - used by both the auth hook
 * (when a new user signs up) and the test setup.
 */
export async function createUserWithDefaults({ username, authUserId }: { username: string; authUserId: string }) {
  // Create the app user linked to the auth user
  const appUser = await userService.createUser({
    username,
    authUserId,
  });

  // Create default categories for the new user
  const defaultCategories = DEFAULT_CATEGORIES.main.map((item) => ({
    ...item,
    userId: appUser.id,
  }));

  const categories = await categoriesService.bulkCreate({ data: defaultCategories }, { returning: true });

  // Create subcategories
  let subcats: Array<{
    name: string;
    parentId: number;
    color: string;
    userId: number;
    type: string;
  }> = [];

  categories.forEach((item) => {
    const subcategories = DEFAULT_CATEGORIES.subcategories.find((subcat) => subcat.parentName === item.name);

    if (subcategories) {
      subcats = [
        ...subcats,
        ...subcategories.values.map((subItem) => ({
          ...subItem,
          parentId: item.id,
          color: item.color,
          userId: appUser.id,
        })),
      ];
    }
  });

  if (subcats.length > 0) {
    await categoriesService.bulkCreate({ data: subcats });
  }

  // Set default category
  const defaultCategory = categories.find((item) => item.name === DEFAULT_CATEGORIES.names.other);

  if (defaultCategory) {
    await userService.updateUser({
      id: appUser.id,
      defaultCategoryId: defaultCategory.id,
    });
  }

  return appUser;
}
