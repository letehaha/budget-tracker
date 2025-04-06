import { MonobankUserModel } from '@bt/shared/types';
import * as MonobankUsers from '@models/banks/monobank/Users.model';
import { withTransaction } from '@root/services/common/with-transaction';

export const getUserById = withTransaction(
  async ({ id }): Promise<MonobankUserModel | null> => MonobankUsers.getById({ id }),
);

export const getUserByToken = withTransaction(
  async ({ token, userId }: { token: string; userId: number }): Promise<MonobankUserModel | null> =>
    MonobankUsers.getUserByToken({ token, userId }),
);

export const createUser = withTransaction(
  async (payload: MonobankUsers.MonoUserCreationPayload): Promise<MonobankUserModel | null> =>
    MonobankUsers.createUser(payload),
);

export const getUserBySystemId = withTransaction(
  async ({ systemUserId }: { systemUserId: number }): Promise<MonobankUserModel | null> =>
    MonobankUsers.getUserBySystemId({ systemUserId }),
);

export const updateUser = withTransaction(
  async (payload: MonobankUsers.MonoUserUpdatePayload): Promise<MonobankUserModel | null> =>
    MonobankUsers.updateUser(payload),
);
