import { USER_ROLES, UserModel, UserRole } from '@bt/shared/types';

export const USER: UserModel = {
  id: 1,
  username: 'letehaha1',
  email: '',
  firstName: '',
  lastName: '',
  middleName: '',
  avatar: '',
  totalBalance: 0,
  defaultCategoryId: 3131,
  role: USER_ROLES.common as UserRole,
};

export const DEMO_USER = {
  ...USER,
  id: 999,
  username: 'demo-user',
  email: 'demo@demo.local',
  role: USER_ROLES.demo as UserRole,
};

export const ADMIN_USER = {
  ...USER,
  id: 2,
  username: 'admin',
  email: 'admin@example.com',
  role: USER_ROLES.admin as UserRole,
};
