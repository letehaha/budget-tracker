import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

import { getAccountData, setSettings } from '../../controllers/crypto/binance.controller';
import { authenticateJwt } from '../../middlewares/passport';

const router = Router({});

router.get('/account', authenticateJwt, validateEndpoint(getAccountData.schema), getAccountData.handler);
router.post('/set-settings', authenticateJwt, validateEndpoint(setSettings.schema), setSettings.handler);

export default router;
