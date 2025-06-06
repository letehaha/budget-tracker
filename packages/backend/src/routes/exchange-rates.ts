import getExchangeRatesForDate from '@controllers/exchange-rates/rates-for-date.controller';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get(
  '/:date',
  authenticateJwt,
  validateEndpoint(getExchangeRatesForDate.schema),
  getExchangeRatesForDate.handler,
);

export default router;
