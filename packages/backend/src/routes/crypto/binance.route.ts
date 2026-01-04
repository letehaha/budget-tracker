import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

import { getAccountData, setSettings } from '../../controllers/crypto/binance.controller';

const router = Router({});

router.get('/account', authenticateSession, validateEndpoint(getAccountData.schema), getAccountData.handler);
router.post('/set-settings', authenticateSession, validateEndpoint(setSettings.schema), setSettings.handler);

export default router;
