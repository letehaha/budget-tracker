import getAllCurrencies from '@controllers/currencies.controller';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', [], validateEndpoint(getAllCurrencies.schema), getAllCurrencies.handler);

export default router;
