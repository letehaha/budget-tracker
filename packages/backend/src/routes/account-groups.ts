import * as accountGroupController from '@controllers/account-groups';
import { authenticateSession } from '@middlewares/better-auth';
import { checkBaseCurrencyLock } from '@middlewares/check-base-currency-lock';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router();

router.post(
  '/',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(accountGroupController.createAccountGroup.schema),
  accountGroupController.createAccountGroup.handler,
);

router.get(
  '/',
  authenticateSession,
  validateEndpoint(accountGroupController.getGroups.schema),
  accountGroupController.getGroups.handler,
);

router.put(
  '/:groupId',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(accountGroupController.updateGroup.schema),
  accountGroupController.updateGroup.handler,
);

router.delete(
  '/:groupId',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(accountGroupController.deleteGroup.schema),
  accountGroupController.deleteGroup.handler,
);

router.post(
  '/:groupId/add-account/:accountId',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(accountGroupController.addAccountToGroup.schema),
  accountGroupController.addAccountToGroup.handler,
);

router.delete(
  '/:groupId/accounts',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(accountGroupController.removeAccountFromGroup.schema),
  accountGroupController.removeAccountFromGroup.handler,
);

router.put(
  '/:groupId/move',
  authenticateSession,
  checkBaseCurrencyLock,
  validateEndpoint(accountGroupController.moveAccountToGroup.schema),
  accountGroupController.moveAccountToGroup.handler,
);

router.get(
  '/:groupId/accounts',
  authenticateSession,
  validateEndpoint(accountGroupController.getAccountsInGroup.schema),
  accountGroupController.getAccountsInGroup.handler,
);

export default router;
