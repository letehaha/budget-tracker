import { Router } from 'express';

import { getAccountData, setSettings } from '../../controllers/crypto/binance.controller';
import { authenticateJwt } from '../../middlewares/passport';

const router = Router({});

router.get('/account', authenticateJwt, getAccountData);
router.post('/set-settings', authenticateJwt, setSettings);

export default router;
