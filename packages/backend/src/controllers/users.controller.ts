import { UserModel } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { getUsers as getUsersModel } from '../models/Users.model';
import { z } from 'zod';

const schema = z.object({});

export default createController(schema, async () => {
  const users: UserModel[] = await getUsersModel();
  return { data: users };
});