import type { LoanApi } from '@/api/loans';
import { ACCOUNT_STATUSES } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { partitionLoans } from './partition-loans';

const makeLoan = ({
  id,
  status = ACCOUNT_STATUSES.active,
  isPaidOff = false,
}: {
  id: string;
  status?: ACCOUNT_STATUSES;
  isPaidOff?: boolean;
}): LoanApi => ({ id, status, projection: { isPaidOff } }) as LoanApi;

describe('partitionLoans', () => {
  it('splits loans into active, paid-off and archived groups', () => {
    const active = makeLoan({ id: 'a' });
    const paidOff = makeLoan({ id: 'b', isPaidOff: true });
    const archived = makeLoan({ id: 'c', status: ACCOUNT_STATUSES.archived });

    const result = partitionLoans({ loans: [active, paidOff, archived] });

    expect(result.active).toEqual([active]);
    expect(result.paidOff).toEqual([paidOff]);
    expect(result.archived).toEqual([archived]);
  });

  it('puts an archived paid-off loan only into the archived group', () => {
    const archivedPaidOff = makeLoan({ id: 'a', status: ACCOUNT_STATUSES.archived, isPaidOff: true });

    const result = partitionLoans({ loans: [archivedPaidOff] });

    expect(result.archived).toEqual([archivedPaidOff]);
    expect(result.paidOff).toEqual([]);
    expect(result.active).toEqual([]);
  });

  it('returns empty groups for an empty list', () => {
    expect(partitionLoans({ loans: [] })).toEqual({ active: [], paidOff: [], archived: [] });
  });
});
