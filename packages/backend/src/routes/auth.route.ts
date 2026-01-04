import { login, register, setPassword, validateToken } from '@controllers/auth.controller';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/validate-token', authenticateJwt, validateEndpoint(validateToken.schema), validateToken.handler);
router.post('/login', [], validateEndpoint(login.schema), login.handler);
router.post('/register', [], validateEndpoint(register.schema), register.handler);
router.post('/set-password', validateEndpoint(setPassword.schema), setPassword.handler);

export default router;
