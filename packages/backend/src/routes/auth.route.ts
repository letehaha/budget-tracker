import { login, register, validateToken } from '@controllers/auth.controller';
import { authenticateJwt } from '@middlewares/passport';
import { Router } from 'express';

const router = Router({});

router.get('/validate-token', authenticateJwt, validateToken);
router.post('/login', [], login);
router.post('/register', [], register);

export default router;
