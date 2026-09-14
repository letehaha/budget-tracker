import { type RecordId, TRIAL_DAYS } from '@bt/shared/types';
import { getTranslatedCategories } from '@common/const/default-categories';
import { getTranslatedDefaultTags } from '@common/const/default-tags';
import { requestContext } from '@common/request-context';
import { isSelfHost } from '@config/is-self-host';
import { i18nextReady } from '@i18n/index';
import { ValidationError } from '@js/errors';
import { logger } from '@js/utils/logger';
import * as categoriesService from '@services/categories.service';
import * as tagsService from '@services/tags';
import * as userService from '@services/user.service';
import { forgetSignup, recordSignup } from '@services/user/signups-open.service';
import { randomBytes } from 'crypto';
import { UniqueConstraintError } from 'sequelize';

import { parseFullName } from './parse-full-name';
import { slugifyUsername } from './slugify-username';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The trial runs from the first time this email was ever seen, so deleting an account
 * and signing up again resumes the original window instead of granting a new one.
 * `ledgerCreated` says whether this call claimed the ledger slot, so the caller can
 * release it if the user row never materializes.
 */
const startTrial = async ({
  email,
  authUserId,
}: {
  email?: string | null;
  authUserId: string;
}): Promise<{ trialEndsAt: Date | null; ledgerCreated: boolean }> => {
  if (isSelfHost()) return { trialEndsAt: null, ledgerCreated: false };

  if (!email) {
    // Without an email there is no ledger key, so such a signup would take no cap slot
    // and could restart a trial on every re-registration.
    throw new ValidationError({
      message: `Signup requires an email address; the auth provider supplied none (authUserId="${authUserId}").`,
    });
  }

  const { firstSeenAt, created } = await recordSignup({ email });
  return { trialEndsAt: new Date(firstSeenAt.getTime() + TRIAL_DAYS * DAY_MS), ledgerCreated: created };
};

/**
 * Creates the app user row linked to a better-auth user.
 *
 * Two distinct concerns from one input:
 *   - `username` (identity slug): slugified — lowercase, hyphenated,
 *     ASCII-only — to make a stable, URL-safe identifier.
 *   - `firstName` / `middleName` / `lastName` (display): parsed from
 *     `fullName` if provided, preserving original casing and punctuation.
 *
 * `username` is unique at the DB level, but two users whose names slugify
 * to the same value are entirely possible (e.g. "John" and "john" both →
 * "john"). On collision we retry once with a short random hex suffix.
 *
 * The signup ledger is claimed before the user row is written and released again if
 * writing it fails. `email` is optional only for self-host, which keeps no ledger; on
 * cloud a missing email rejects the signup.
 *
 * `fullName` is the actual human-readable name from the auth provider
 * (OAuth `user.name`). Pass `undefined` when the only available value is
 * an email prefix or a synthetic fallback — those shouldn't pollute the
 * display-name fields.
 *
 * Throws on any failure — the caller is responsible for compensating actions
 * (e.g. rolling back the orphaned ba_user row).
 */
export async function createAppUserWithUniqueUsername({
  username,
  fullName,
  authUserId,
  email,
}: {
  username: string;
  fullName?: string | null;
  authUserId: string;
  email?: string | null;
}) {
  const slug = slugifyUsername(username);
  const { firstName, middleName, lastName } = parseFullName(fullName);

  const { trialEndsAt, ledgerCreated } = await startTrial({ email, authUserId });
  const baseInput = {
    firstName,
    middleName,
    lastName,
    authUserId,
    trialEndsAt,
  };

  const create = async () => {
    try {
      return await userService.createUser({ username: slug, ...baseInput });
    } catch (error) {
      const isUsernameConflict =
        error instanceof UniqueConstraintError && error.errors?.some((e) => e.path === 'username');

      if (!isUsernameConflict) throw error;

      const uniqueUsername = `${slug}-${randomBytes(4).toString('hex')}`;

      // Surface collision retries so a sudden spike (or a slug pointing at a
      // popular human name) is visible in logs / log-based metrics. Without
      // this, the first-attempt failure is swallowed entirely.
      logger.info(
        `Username collision on signup: requested="${slug}", retrying with="${uniqueUsername}", authUserId="${authUserId}"`,
      );

      return userService.createUser({ username: uniqueUsername, ...baseInput });
    }
  };

  try {
    return await create();
  } catch (error) {
    // Only a row this call inserted may go: an earlier signup's slot must survive.
    // A failed release leaves a claimed slot behind, which is far less harmful than
    // masking the signup failure the caller compensates for.
    if (ledgerCreated && email) {
      try {
        await forgetSignup({ email });
      } catch (releaseError) {
        logger.error({ message: 'Failed to release the signup ledger slot', error: releaseError as Error });
      }
    }
    throw error;
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
    key: item.key,
    userId,
  }));

  // The column allows NULL (user-created custom categories don't have a key), but the
  // seed path always should guard against future drift in `getTranslatedCategories`
  // that would silently produce keyless defaults. In prod we log to Sentry and continue
  // (degraded but not catastrophic — the user still gets categories); in dev/test we
  // throw so bugs surface loudly during development.
  const mainMissingKey = defaultCategories.find((c) => !c.key);
  if (mainMissingKey) {
    const message = `Seed integrity bug: default category "${mainMissingKey.name}" is missing 'key'`;
    logger.error(message);
    if (process.env.NODE_ENV !== 'production') throw new Error(message);
  }

  const categories = await categoriesService.bulkCreate({ data: defaultCategories }, { returning: true });

  const categoryKeyToId = new Map<string, { id: RecordId; color: string }>();
  translatedCategories.main.forEach((item, index) => {
    const createdCategory = categories[index];
    if (createdCategory) {
      categoryKeyToId.set(item.key, { id: createdCategory.id, color: createdCategory.color });
    }
  });

  const subcats: Array<{
    name: string;
    parentId: string;
    color: string;
    icon?: string;
    userId: number;
    type: string;
    key: string;
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
          key: subItem.key,
        });
      });
    }
  });

  const subMissingKey = subcats.find((s) => !s.key);
  if (subMissingKey) {
    const message = `Seed integrity bug: default subcategory "${subMissingKey.name}" is missing 'key'`;
    logger.error(message);
    if (process.env.NODE_ENV !== 'production') throw new Error(message);
  }

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
