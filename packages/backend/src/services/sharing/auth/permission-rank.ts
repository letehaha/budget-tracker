import type { SharePermission } from '@bt/shared/types';
import { SHARE_PERMISSIONS } from '@bt/shared/types';

const PERMISSION_RANK: Record<SharePermission, number> = {
  [SHARE_PERMISSIONS.read]: 1,
  [SHARE_PERMISSIONS.write]: 2,
  [SHARE_PERMISSIONS.manage]: 3,
};

export const isPermissionAtLeast = ({
  granted,
  required,
}: {
  granted: SharePermission;
  required: SharePermission;
}): boolean => PERMISSION_RANK[granted] >= PERMISSION_RANK[required];
