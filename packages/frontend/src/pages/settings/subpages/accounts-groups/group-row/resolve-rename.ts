type RenameOutcome = 'submit' | 'empty' | 'unchanged';

/**
 * Decides what a rename draft is worth doing, and hands back the exact name the API
 * would receive. `empty` and `unchanged` both mean "don't call the API", but they're
 * kept apart so the form can say why rather than just sitting disabled.
 */
export const resolveRename = ({
  draftName,
  currentName,
}: {
  draftName: string;
  currentName: string;
}): { outcome: RenameOutcome; name: string } => {
  const name = draftName.trim();

  if (!name) return { outcome: 'empty', name };
  if (name === currentName) return { outcome: 'unchanged', name };

  return { outcome: 'submit', name };
};
