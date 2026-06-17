import PaymentReminderPeriods from '@models/payment-reminder-periods.model';
import PaymentReminders from '@models/payment-reminders.model';

/**
 * Decides whether a recurring reminder has consumed its installment allowance.
 *
 * The schedule is capped by `maxOccurrences`: once the reminder has accumulated
 * that many periods of ANY status (upcoming, overdue, paid, or skipped), no
 * further period is generated. A skipped period still counts toward the cap, so
 * skipping does not extend the schedule — this is intentional and predictable.
 *
 * When the cap is reached the reminder is deactivated (`isActive = false`) so it
 * drops out of the active-reminder cron sweeps and default listings: the schedule
 * is fully spent. `null` maxOccurrences means repeat indefinitely.
 *
 * Returns `true` when the cap is reached (and the reminder was deactivated),
 * meaning the caller must NOT create another period.
 */
export async function isReminderInstallmentCapReached({ reminder }: { reminder: PaymentReminders }): Promise<boolean> {
  if (reminder.maxOccurrences == null) return false;

  const existingCount = await PaymentReminderPeriods.count({
    where: { reminderId: reminder.id },
  });

  if (existingCount < reminder.maxOccurrences) return false;

  if (reminder.isActive) {
    await reminder.update({ isActive: false });
  }

  return true;
}
