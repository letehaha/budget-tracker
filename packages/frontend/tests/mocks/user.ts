import { USER_ROLES, UserRole } from '@bt/shared/types';

export const USER = {
  id: 1,
  username: 'letehaha1',
  email: null,
  firstName: null,
  lastName: null,
  middleName: null,
  avatar: null,
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
