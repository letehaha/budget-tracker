import { ValidationError } from '@js/errors';

import { type ArchiveAnalysis, analyzeArchive } from './analyze-archive';
import { type ParsedArchive, loadBackupArchive } from './load-archive';

/**
 * Load + analyze a backup archive, throwing a 422 `ValidationError` on any hard
 * failure. Shared by the sync preflight and the worker (which re-parses because
 * the archive can't ride through Redis) so the two can't drift on the validation
 * contract.
 */
export async function loadValidatedArchive({
  fileContent,
}: {
  fileContent: string;
}): Promise<{ archive: ParsedArchive; analysis: ArchiveAnalysis }> {
  const archive = await loadBackupArchive({ fileContent });
  const analysis = analyzeArchive({ archive });
  if (analysis.hardFailReasons.length > 0) {
    throw new ValidationError({ message: analysis.hardFailReasons.join(' ') });
  }
  return { archive, analysis };
}
