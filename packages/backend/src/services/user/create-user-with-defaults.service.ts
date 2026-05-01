import { getTranslatedCategories } from '@common/const/default-categories';
import { getTranslatedDefaultTags } from '@common/const/default-tags';
import { requestContext } from '@common/request-context';
import { i18nextReady } from '@i18n/index';
import * as categoriesService from '@services/categories.service';
import * as tagsService from '@services/tags';
import * as userService from '@services/user.service';
import { randomBytes } from 'crypto';
import { UniqueConstraintError } from 'sequelize';

/**
 * Creates the app user row linked to a better-auth user.
 *
 * Username is unique at the DB level, but the value here comes from the auth
 * provider's `name` (or email prefix), which is not guaranteed unique across
 * users. On collision, retry once with a random suffix — the chance of a
 * second collision is negligible.
 *
 * Throws on any failure — the caller is responsible for compensating actions
 * (e.g. rolling back the orphaned ba_user row).
 */
export async function createAppUserWithUniqueUsername({
  username,
  authUserId,
}: {
  username: string;
  authUserId: string;
}) {
  try {
    return await userService.createUser({ username, authUserId });
  } catch (error) {
    const isUsernameConflict =
      error instanceof UniqueConstraintError && error.errors?.some((e) => e.path === 'username');

    if (!isUsernameConflict) throw error;

    const uniqueUsername = `${username}-${randomBytes(4).toString('hex')}`;
    return userService.createUser({ username: uniqueUsername, authUserId });
  }
}

/**
 * Seeds default categories, subcategories, default-category pointer, and tags
 * for an existing app user.
 *
 * Failures here are non-fatal from the auth flow's perspective — the user
 * already has a usable app row. Callers should catch and surface to telemetry
 * but not roll back the user.
 */
export async function seedUserDefaults({ userId, locale: providedLocale }: { userId: number; locale?: string }) {
  await i18nextReady;

  const locale = providedLocale || requestContext.getLocale();
  const translatedCategories = getTranslatedCategories({ locale });

  const defaultCategories = translatedCategories.main.map((item) => ({
    name: item.name,
    type: item.type,
    color: item.color,
    icon: item.icon,
    userId,
  }));

  const categories = await categoriesService.bulkCreate({ data: defaultCategories }, { returning: true });

  const categoryKeyToId = new Map<string, { id: number; color: string }>();
  translatedCategories.main.forEach((item, index) => {
    const createdCategory = categories[index];
    if (createdCategory) {
      categoryKeyToId.set(item.key, { id: createdCategory.id, color: createdCategory.color });
    }
  });

  const subcats: Array<{
    name: string;
    parentId: number;
    color: string;
    icon?: string;
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
          icon: subItem.icon,
          parentId: parentCategory.id,
          color: parentCategory.color,
          userId,
        });
      });
    }
  });

  if (subcats.length > 0) {
    await categoriesService.bulkCreate({ data: subcats });
  }

  const defaultCategoryKey = translatedCategories.defaultCategoryKey;
  const defaultCategoryInfo = categoryKeyToId.get(defaultCategoryKey);

  if (defaultCategoryInfo) {
    await userService.updateUser({
      id: userId,
      defaultCategoryId: defaultCategoryInfo.id,
    });
  }

  const translatedTags = getTranslatedDefaultTags({ locale });
  const defaultTags = translatedTags.map((tag) => ({
    name: tag.name,
    color: tag.color,
    icon: tag.icon,
    description: tag.description,
  }));

  if (defaultTags.length > 0) {
    await tagsService.bulkCreateTags({
      userId,
      tags: defaultTags,
    });
  }
}

/**
 * One-shot helper: create an app user AND seed all defaults. Used by tests
 * and the demo flow where partial failures are not a concern.
 *
 * The auth hook does NOT use this — it calls the two stages separately so it
 * can apply different error-handling per stage (rollback ba_user on user
 * creation failure vs. tolerate seeding failures).
 */
export async function createUserWithDefaults({
  username,
  authUserId,
  locale,
}: {
  username: string;
  authUserId: string;
  locale?: string;
}) {
  const appUser = await createAppUserWithUniqueUsername({ username, authUserId });
  await seedUserDefaults({ userId: appUser.id, locale });
  return appUser;
}
