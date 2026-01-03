import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

import getUsers from '../controllers/users.controller';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getUsers.schema), getUsers.handler);

export default router;
