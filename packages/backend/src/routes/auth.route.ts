import { login, register, validateToken } from '@controllers/auth.controller';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/validate-token', authenticateJwt, validateEndpoint(validateToken.schema), validateToken.handler);
router.post('/login', [], validateEndpoint(login.schema), login.handler);
router.post('/register', [], validateEndpoint(register.schema), register.handler);

export default router;
