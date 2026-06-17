import { PAYMENT_REMINDER_STATUSES, type PaymentReminderPeriodModel } from '@bt/shared/types';
import { describe, expect, it } from 'vitest';

import { buildInstallmentNumbers } from './utils';

const makePeriod = ({ id, dueDate }: { id: string; dueDate: string }): PaymentReminderPeriodModel =>
  ({
    id,
    reminderId: 'reminder-1',
    dueDate,
    status: PAYMENT_REMINDER_STATUSES.upcoming,
    paidAt: null,
    transactionId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as PaymentReminderPeriodModel;

describe('buildInstallmentNumbers', () => {
  it('numbers a fully-loaded newest-first list chronologically (oldest = 1)', () => {
    const periodsDesc = [
      makePeriod({ id: 'c', dueDate: '2026-03-01' }),
      makePeriod({ id: 'b', dueDate: '2026-02-01' }),
      makePeriod({ id: 'a', dueDate: '2026-01-01' }),
    ];

    expect(buildInstallmentNumbers({ periodsDesc, total: 3 })).toEqual({
      c: 3,
      b: 2,
      a: 1,
    });
  });

  it('keeps absolute installment numbers when only a partial (paginated) window is loaded', () => {
    // total is 10, but only the newest 3 are loaded — the newest is still #10.
    const periodsDesc = [
      makePeriod({ id: 'p10', dueDate: '2026-10-01' }),
      makePeriod({ id: 'p9', dueDate: '2026-09-01' }),
      makePeriod({ id: 'p8', dueDate: '2026-08-01' }),
    ];

    expect(buildInstallmentNumbers({ periodsDesc, total: 10 })).toEqual({
      p10: 10,
      p9: 9,
      p8: 8,
    });
  });

  it('returns an empty map for no periods', () => {
    expect(buildInstallmentNumbers({ periodsDesc: [], total: 0 })).toEqual({});
  });
});
