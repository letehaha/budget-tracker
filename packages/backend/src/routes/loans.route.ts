import appendNoteEvent from '@controllers/loans/append-note-event';
import createLoan from '@controllers/loans/create-loan';
import deleteLoan from '@controllers/loans/delete-loan';
import getBalanceHistory from '@controllers/loans/get-balance-history';
import getLoanById from '@controllers/loans/get-loan-by-id';
import getLoans from '@controllers/loans/get-loans';
import linkPayments from '@controllers/loans/link-payments';
import unlinkPayment from '@controllers/loans/unlink-payment';
import updateLoan from '@controllers/loans/update-loan';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

router.get('/', authenticateSession, validateEndpoint(getLoans.schema), getLoans.handler);
router.get('/:id', authenticateSession, validateEndpoint(getLoanById.schema), getLoanById.handler);
router.get(
  '/:id/balance-history',
  authenticateSession,
  validateEndpoint(getBalanceHistory.schema),
  getBalanceHistory.handler,
);
router.post('/', authenticateSession, checkBaseCurrencyLock, validateEndpoint(createLoan.schema), createLoan.handler);
router.patch(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(updateLoan.schema),
  updateLoan.handler,
);
router.delete(
  '/:id',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(deleteLoan.schema),
  deleteLoan.handler,
);
router.post(
  '/:id/events',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(appendNoteEvent.schema),
  appendNoteEvent.handler,
);
router.post(
  '/:id/link-payments',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(linkPayments.schema),
  linkPayments.handler,
);
router.post(
  '/:id/unlink-payment',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(unlinkPayment.schema),
  unlinkPayment.handler,
);

export default router;
