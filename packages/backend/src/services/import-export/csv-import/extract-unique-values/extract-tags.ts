import { type ColumnMappingConfig, TagOptionValue } from '@bt/shared/types';
import { ValidationError } from '@js/errors';

import { splitTagCell } from '../split-tag-cell';

/**
 * Extract the distinct tag strings the import will need to map. A row's tags
 * live in one comma-delimited column; each cell is split into individual names
 * so a value like `food, travel` surfaces both as separate mapping rows. The
 * result is sorted for a stable mapping table and excludes blanks.
 *
 * Returns an empty array when no tag column is mapped (`tags` absent or `null`).
 */
export function extractTags({
  headers,
  dataRows,
  columnMapping,
}: {
  headers: string[];
  dataRows: string[][];
  columnMapping: ColumnMappingConfig;
}): string[] {
  const tagOption = columnMapping.tags;
  if (!tagOption || tagOption.option !== TagOptionValue.mapDataSourceColumn) {
    return [];
  }

  const tagIndex = headers.indexOf(tagOption.columnName);
  if (tagIndex === -1) {
    throw new ValidationError({
      message: `Tag column "${tagOption.columnName}" not found in CSV`,
    });
  }

  const uniqueTags = new Set<string>();
  dataRows.forEach((row) => {
    for (const name of splitTagCell(row[tagIndex])) {
      uniqueTags.add(name);
    }
  });

  return Array.from(uniqueTags).toSorted();
}
