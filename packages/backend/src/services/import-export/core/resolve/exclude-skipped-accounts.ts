/** The shared account helpers model only create-new and link-existing, so the skip decision is resolved here. */
export function excludeSkippedAccounts<T extends { action: string }>({
  accountMapping,
}: {
  accountMapping: Record<string, T>;
}): Record<string, Exclude<T, { action: 'skip' }>> {
  const importableMapping: Record<string, Exclude<T, { action: 'skip' }>> = {};

  for (const [accountName, mapping] of Object.entries(accountMapping)) {
    if (mapping.action !== 'skip') {
      importableMapping[accountName] = mapping as Exclude<T, { action: 'skip' }>;
    }
  }

  return importableMapping;
}
