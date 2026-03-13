import createReminder from '@controllers/payment-reminders/create-reminder';
import deleteReminder from '@controllers/payment-reminders/delete-reminder';
import getPeriods from '@controllers/payment-reminders/get-periods';
import getReminderById from '@controllers/payment-reminders/get-reminder-by-id';
import getReminders from '@controllers/payment-reminders/get-reminders';
import markPeriodPaid from '@controllers/payment-reminders/mark-period-paid';
import skipPeriod from '@controllers/payment-reminders/skip-period';
import unlinkTransaction from '@controllers/payment-reminders/unlink-transaction';
import updateReminder from '@controllers/payment-reminders/update-reminder';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router({});

// CRUD
router.get('/', authenticateSession, validateEndpoint(getReminders.schema), getReminders.handler);
router.get('/:id', authenticateSession, validateEndpoint(getReminderById.schema), getReminderById.handler);
router.post('/', authenticateSession, validateEndpoint(createReminder.schema), createReminder.handler);
router.put('/:id', authenticateSession, validateEndpoint(updateReminder.schema), updateReminder.handler);
router.delete('/:id', authenticateSession, validateEndpoint(deleteReminder.schema), deleteReminder.handler);

// Period actions
router.get('/:id/periods', authenticateSession, validateEndpoint(getPeriods.schema), getPeriods.handler);
router.post(
  '/:id/periods/:periodId/pay',
  authenticateSession,
  validateEndpoint(markPeriodPaid.schema),
  markPeriodPaid.handler,
);
router.post(
  '/:id/periods/:periodId/skip',
  authenticateSession,
  validateEndpoint(skipPeriod.schema),
  skipPeriod.handler,
);
router.post(
  '/:id/periods/:periodId/unlink',
  authenticateSession,
  validateEndpoint(unlinkTransaction.schema),
  unlinkTransaction.handler,
);

export default router;
