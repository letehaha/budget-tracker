import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

import getUsers from '../controllers/users.controller';
import { authenticateJwt } from '../middlewares/passport';

const router = Router({});

router.get('/', authenticateJwt, validateEndpoint(getUsers.schema), getUsers.handler);

export default router;
