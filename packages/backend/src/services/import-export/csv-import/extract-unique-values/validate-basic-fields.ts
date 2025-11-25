import type { ColumnMappingConfig } from '@bt/shared/types';
import { ValidationError } from '@js/errors';

export function validateBasicFields({
  headers,
  columnMapping,
}: {
  headers: string[];
  columnMapping: ColumnMappingConfig;
}): void {
  if (!headers.includes(columnMapping.date)) {
    throw new ValidationError({ message: `Date column "${columnMapping.date}" not found in CSV` });
  }

  if (!headers.includes(columnMapping.amount)) {
    throw new ValidationError({ message: `Amount column "${columnMapping.amount}" not found in CSV` });
  }
}
