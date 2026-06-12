import { applyPayeeTagOverride } from '@/common/utils/payee-tag-override';
import { ref, watch, type Ref } from 'vue';

/**
 * Wires a form's tag list to payee selection: picking a payee merges its
 * default tags into `tagIds`, a later payee change swaps only the previously
 * auto-applied portion (tracked internally), and clearing `payeeId` retracts
 * it — tags the user picked manually always survive. The set math lives in
 * `applyPayeeTagOverride`; this composable owns the `lastAutoAppliedTagIds`
 * tracking and the payee-clear watcher shared by the transaction form and the
 * bulk-edit dialog.
 */
export function usePayeeTagAutoApply({
  tagIds,
  payeeId,
}: {
  /** Two-way binding to the form's tag list. */
  tagIds: Ref<string[]>;
  /** Getter for the form's payee id; clearing it retracts auto-applied tags. */
  payeeId: () => string | null | undefined;
}) {
  const lastAutoAppliedTagIds = ref<string[]>([]);

  const onPayeeSelected = ({ defaultTagIds }: { defaultTagIds: string[] }) => {
    tagIds.value = applyPayeeTagOverride({
      currentTagIds: tagIds.value,
      lastAutoAppliedTagIds: lastAutoAppliedTagIds.value,
      payeeTagIds: defaultTagIds,
    });
    lastAutoAppliedTagIds.value = [...defaultTagIds];
  };

  /**
   * Forget the auto-applied set without touching `tagIds` — for form resets
   * that clear the tag list themselves.
   */
  const reset = () => {
    lastAutoAppliedTagIds.value = [];
  };

  watch(payeeId, (id) => {
    if (id) return;
    if (lastAutoAppliedTagIds.value.length === 0) return;
    tagIds.value = applyPayeeTagOverride({
      currentTagIds: tagIds.value,
      lastAutoAppliedTagIds: lastAutoAppliedTagIds.value,
      payeeTagIds: [],
    });
    lastAutoAppliedTagIds.value = [];
  });

  return { onPayeeSelected, reset };
}
