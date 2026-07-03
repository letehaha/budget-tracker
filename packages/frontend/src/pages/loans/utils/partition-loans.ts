import type { LoanApi } from '@/api/loans';
import { ACCOUNT_STATUSES } from '@bt/shared/types';

export interface PartitionedLoans {
  /** Loans the user is still paying down. */
  active: LoanApi[];
  /** Settled loans the user still tracks. */
  paidOff: LoanApi[];
  /**
   * Loans the user stopped tracking (refinanced elsewhere, written off, handed over, …).
   * Archive wins over paid-off: a settled loan that was archived appears only here, so the
   * Paid off section stays a list of debts the user still wants on the page.
   */
  archived: LoanApi[];
}

export const partitionLoans = ({ loans }: { loans: LoanApi[] }): PartitionedLoans => {
  const partitioned: PartitionedLoans = { active: [], paidOff: [], archived: [] };
  for (const loan of loans) {
    if (loan.status === ACCOUNT_STATUSES.archived) {
      partitioned.archived.push(loan);
    } else if (loan.projection.isPaidOff) {
      partitioned.paidOff.push(loan);
    } else {
      partitioned.active.push(loan);
    }
  }
  return partitioned;
};
