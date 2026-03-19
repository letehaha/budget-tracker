import { findOrThrowNotFound } from '@common/utils/find-or-throw-not-found';
import * as Accounts from '@models/Accounts.model';
import Categories from '@models/Categories.model';
import Subscriptions from '@models/Subscriptions.model';

export const findSubscriptionOrThrow = async ({ id, userId }: { id: string; userId: number }) => {
  return findOrThrowNotFound({
    query: Subscriptions.findOne({ where: { id, userId } }),
    message: 'Subscription not found.',
  });
};

export const validateAccountOwnership = async ({ accountId, userId }: { accountId: number; userId: number }) => {
  await findOrThrowNotFound({
    query: Accounts.getAccountById({ userId, id: accountId }),
    message: 'Account not found or does not belong to user.',
  });
};

export const validateCategoryOwnership = async ({ categoryId, userId }: { categoryId: number; userId: number }) => {
  await findOrThrowNotFound({
    query: Categories.findOne({ where: { id: categoryId, userId } }),
    message: 'Category not found or does not belong to user.',
  });
};
