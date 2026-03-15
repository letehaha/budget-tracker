import { NotFoundError } from '@js/errors';
import * as Accounts from '@models/Accounts.model';
import Categories from '@models/Categories.model';
import Subscriptions from '@models/Subscriptions.model';

export const findSubscriptionOrThrow = async ({ id, userId }: { id: string; userId: number }) => {
  const subscription = await Subscriptions.findOne({ where: { id, userId } });
  if (!subscription) {
    throw new NotFoundError({ message: 'Subscription not found.' });
  }
  return subscription;
};

export const validateAccountOwnership = async ({ accountId, userId }: { accountId: number; userId: number }) => {
  const account = await Accounts.getAccountById({ userId, id: accountId });
  if (!account) {
    throw new NotFoundError({ message: 'Account not found or does not belong to user.' });
  }
};

export const validateCategoryOwnership = async ({ categoryId, userId }: { categoryId: number; userId: number }) => {
  const category = await Categories.findOne({ where: { id: categoryId, userId } });
  if (!category) {
    throw new NotFoundError({ message: 'Category not found or does not belong to user.' });
  }
};
