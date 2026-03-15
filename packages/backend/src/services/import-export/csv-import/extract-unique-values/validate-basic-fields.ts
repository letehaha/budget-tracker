import type { ColumnMappingConfig } from '@bt/shared/types';
import { t } from '@i18n/index';
import { ValidationError } from '@js/errors';

export function validateBasicFields({
  headers,
  columnMapping,
}: {
  headers: string[];
  columnMapping: ColumnMappingConfig;
}): void {
  if (!headers.includes(columnMapping.date)) {
    throw new ValidationError({
      message: t({ key: 'csvImport.dateColumnNotFound', variables: { columnName: columnMapping.date } }),
    });
  }

  if (!headers.includes(columnMapping.amount)) {
    throw new ValidationError({
      message: t({ key: 'csvImport.amountColumnNotFound', variables: { columnName: columnMapping.amount } }),
    });
  }
}
