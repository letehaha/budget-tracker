/**
 * Recompute a transaction form's tag selection when the selected Payee
 * changes.
 *
 * The form distinguishes two kinds of tags without per-tag provenance flags:
 * whatever the previous payee auto-applied is remembered by the caller in
 * `lastAutoAppliedTagIds`; everything else in the current selection counts as
 * the user's manual picks. A payee change swaps the auto portion wholesale
 * (a payee with no tag rule simply clears it) while manual picks always
 * survive and are merged with the new payee's tags.
 */
export function applyPayeeTagOverride({
  currentTagIds,
  lastAutoAppliedTagIds,
  payeeTagIds,
}: {
  currentTagIds: string[];
  lastAutoAppliedTagIds: string[];
  payeeTagIds: string[];
}): string[] {
  const previousAuto = new Set(lastAutoAppliedTagIds);
  const manual = currentTagIds.filter((id) => !previousAuto.has(id));
  const manualSet = new Set(manual);
  return [...manual, ...payeeTagIds.filter((id) => !manualSet.has(id))];
}
