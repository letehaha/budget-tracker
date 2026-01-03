import * as accountGroupController from '@controllers/account-groups';
import { authenticateSession } from '@middlewares/better-auth';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router();

router.post(
  '/',
  authenticateSession,
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
  validateEndpoint(accountGroupController.updateGroup.schema),
  accountGroupController.updateGroup.handler,
);

router.delete(
  '/:groupId',
  authenticateSession,
  validateEndpoint(accountGroupController.deleteGroup.schema),
  accountGroupController.deleteGroup.handler,
);

router.post(
  '/:groupId/add-account/:accountId',
  authenticateSession,
  validateEndpoint(accountGroupController.addAccountToGroup.schema),
  accountGroupController.addAccountToGroup.handler,
);

router.delete(
  '/:groupId/accounts',
  authenticateSession,
  validateEndpoint(accountGroupController.removeAccountFromGroup.schema),
  accountGroupController.removeAccountFromGroup.handler,
);

router.put(
  '/:groupId/move',
  authenticateSession,
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
