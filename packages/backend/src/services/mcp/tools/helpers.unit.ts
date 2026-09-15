import { USER_ROLES } from '@bt/shared/types';
import { describe, expect, it } from '@jest/globals';

import { requireScope } from './helpers';

const authInfoFor = ({ role, scopes, readOnly = false }: { role: string; scopes: string[]; readOnly?: boolean }) => ({
  authInfo: { scopes, extra: { role, readOnly } },
});

describe('requireScope', () => {
  it('blocks demo users from write tools even when the scope is granted', () => {
    const extra = authInfoFor({ role: USER_ROLES.demo, scopes: ['finance:read', 'finance:write', 'finance:delete'] });

    expect(() => requireScope({ extra, scope: 'finance:write' })).toThrow(/demo mode/);
    expect(() => requireScope({ extra, scope: 'finance:delete' })).toThrow(/demo mode/);
  });

  it('allows regular users with the granted scope', () => {
    const extra = authInfoFor({ role: USER_ROLES.common, scopes: ['finance:write'] });

    expect(() => requireScope({ extra, scope: 'finance:write' })).not.toThrow();
  });

  it('blocks read-only users from write tools even when the scope is granted', () => {
    const extra = authInfoFor({ role: USER_ROLES.common, scopes: ['finance:write'], readOnly: true });

    expect(() => requireScope({ extra, scope: 'finance:write' })).toThrow(/no longer includes editing/);
  });

  it('treats a missing readOnly flag as read-only', () => {
    const extra = { authInfo: { scopes: ['finance:write'], extra: { role: USER_ROLES.common } } };

    expect(() => requireScope({ extra, scope: 'finance:write' })).toThrow(/no longer includes editing/);
  });

  it('rejects regular users missing the scope', () => {
    const extra = authInfoFor({ role: USER_ROLES.common, scopes: ['finance:read'] });

    expect(() => requireScope({ extra, scope: 'finance:write' })).toThrow(/Missing required scope/);
  });
});
