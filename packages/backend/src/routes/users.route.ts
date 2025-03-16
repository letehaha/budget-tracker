import { Router } from 'express';

import { getUsers } from '../controllers/users.controller';
import { authenticateJwt } from '../middlewares/passport';

const router = Router({});

router.get('/', authenticateJwt, getUsers);

export default router;
