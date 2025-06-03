import * as accountGroupController from '@controllers/account-groups';
import { authenticateJwt } from '@middlewares/passport';
import { validateEndpoint } from '@middlewares/validations';
import { Router } from 'express';

const router = Router();

router.post(
  '/',
  authenticateJwt,
  validateEndpoint(accountGroupController.createAccountGroup.schema),
  accountGroupController.createAccountGroup.handler,
);

router.get(
  '/',
  authenticateJwt,
  validateEndpoint(accountGroupController.getGroups.schema),
  accountGroupController.getGroups.handler,
);

router.put(
  '/:groupId',
  authenticateJwt,
  validateEndpoint(accountGroupController.updateGroup.schema),
  accountGroupController.updateGroup.handler,
);

router.delete(
  '/:groupId',
  authenticateJwt,
  validateEndpoint(accountGroupController.deleteGroup.schema),
  accountGroupController.deleteGroup.handler,
);

router.post(
  '/:groupId/add-account/:accountId',
  authenticateJwt,
  validateEndpoint(accountGroupController.addAccountToGroup.schema),
  accountGroupController.addAccountToGroup.handler,
);

router.delete(
  '/:groupId/accounts',
  authenticateJwt,
  validateEndpoint(accountGroupController.removeAccountFromGroup.schema),
  accountGroupController.removeAccountFromGroup.handler,
);

router.put(
  '/:groupId/move',
  authenticateJwt,
  validateEndpoint(accountGroupController.moveAccountToGroup.schema),
  accountGroupController.moveAccountToGroup.handler,
);

router.get(
  '/:groupId/accounts',
  authenticateJwt,
  validateEndpoint(accountGroupController.getAccountsInGroup.schema),
  accountGroupController.getAccountsInGroup.handler,
);

export default router;
