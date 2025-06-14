import getAllSecurities from '@controllers/investments/securities/get-all.controller';
import triggerSecuritiesSync from '@controllers/investments/securities/sync.controller';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.post('/sync/securities', validateEndpoint(triggerSecuritiesSync.schema), triggerSecuritiesSync.handler);

router.get('/securities', authenticateJwt, validateEndpoint(getAllSecurities.schema), getAllSecurities.handler);

export default router;
