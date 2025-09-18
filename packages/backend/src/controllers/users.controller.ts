import { UserModel } from '@bt/shared/types';
import { createController } from '@controllers/helpers/controller-factory';
import { z } from 'zod';

import { getUsers as getUsersModel } from '../models/Users.model';

const schema = z.object({});

export default createController(schema, async () => {
  const users: UserModel[] = await getUsersModel();
  return { data: users };
});
