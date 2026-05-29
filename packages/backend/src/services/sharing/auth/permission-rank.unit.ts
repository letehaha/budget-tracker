import { SHARE_PERMISSIONS } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { isPermissionAtLeast } from './permission-rank';

describe('isPermissionAtLeast', () => {
  it('treats equal permissions as satisfied', () => {
    expect(isPermissionAtLeast({ granted: SHARE_PERMISSIONS.read, required: SHARE_PERMISSIONS.read })).toBe(true);
    expect(isPermissionAtLeast({ granted: SHARE_PERMISSIONS.write, required: SHARE_PERMISSIONS.write })).toBe(true);
    expect(isPermissionAtLeast({ granted: SHARE_PERMISSIONS.manage, required: SHARE_PERMISSIONS.manage })).toBe(true);
  });

  it('treats higher granted permissions as satisfying lower required ones', () => {
    expect(isPermissionAtLeast({ granted: SHARE_PERMISSIONS.write, required: SHARE_PERMISSIONS.read })).toBe(true);
    expect(isPermissionAtLeast({ granted: SHARE_PERMISSIONS.manage, required: SHARE_PERMISSIONS.read })).toBe(true);
    expect(isPermissionAtLeast({ granted: SHARE_PERMISSIONS.manage, required: SHARE_PERMISSIONS.write })).toBe(true);
  });

  it('treats lower granted permissions as failing higher required ones', () => {
    expect(isPermissionAtLeast({ granted: SHARE_PERMISSIONS.read, required: SHARE_PERMISSIONS.write })).toBe(false);
    expect(isPermissionAtLeast({ granted: SHARE_PERMISSIONS.read, required: SHARE_PERMISSIONS.manage })).toBe(false);
    expect(isPermissionAtLeast({ granted: SHARE_PERMISSIONS.write, required: SHARE_PERMISSIONS.manage })).toBe(false);
  });
});
