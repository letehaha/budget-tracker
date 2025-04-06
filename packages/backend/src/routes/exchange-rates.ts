import {
  getExchangeRatesForDate,
  getExchangeRatesForDateSchema,
} from '@controllers/exchange-rates/rates-for-date.controller';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/:date', authenticateJwt, validateEndpoint(getExchangeRatesForDateSchema), getExchangeRatesForDate);

export default router;
