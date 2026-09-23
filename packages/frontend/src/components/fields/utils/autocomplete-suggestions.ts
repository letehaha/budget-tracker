/** Case-insensitive substring match; empty when nothing matches. */
export const filterAutocompleteSuggestions = ({
  suggestions,
  query,
}: {
  suggestions: string[];
  query: string;
}): string[] => {
  const typed = query.trim();
  const needle = typed.toLowerCase();
  const matches = suggestions.filter((suggestion) => suggestion.toLowerCase().includes(needle));
  if (!matches.length) return [];

  // Typed text leads the list: the combobox highlights the first item on input and Enter picks it.
  return typed && !suggestions.includes(typed) ? [typed, ...matches] : matches;
};
