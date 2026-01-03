import getExchangeRatesForDate from '@controllers/exchange-rates/rates-for-date.controller';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get(
  '/:date',
  authenticateSession,
  validateEndpoint(getExchangeRatesForDate.schema),
  getExchangeRatesForDate.handler,
);

export default router;
