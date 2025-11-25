import { type ColumnMappingConfig, TransactionTypeOptionValue } from '@bt/shared/types';
import { ValidationError } from '@js/errors';

export function validateTransactionType({
  headers,
  dataRows,
  columnMapping,
}: {
  headers: string[];
  dataRows: string[][];
  columnMapping: ColumnMappingConfig;
}): void {
  const transactionTypeOption = columnMapping.transactionType;

  if (transactionTypeOption.option === TransactionTypeOptionValue.dataSourceColumn) {
    const typeIndex = headers.indexOf(transactionTypeOption.columnName);
    if (typeIndex === -1) {
      throw new ValidationError({
        message: `Transaction type column "${transactionTypeOption.columnName}" not found in CSV`,
      });
    }

    // Collect unique type values
    const uniqueTypes = new Set<string>();
    dataRows.forEach((row) => {
      const type = row[typeIndex]?.trim();
      if (type) uniqueTypes.add(type);
    });

    const typesArray = Array.from(uniqueTypes);
    const { incomeValues, expenseValues } = transactionTypeOption;

    // Validate all values are covered
    const allCovered = typesArray.every((type) => incomeValues.includes(type) || expenseValues.includes(type));

    if (!allCovered) {
      const uncovered = typesArray.filter((type) => !incomeValues.includes(type) && !expenseValues.includes(type));
      throw new ValidationError({
        message: `Transaction type column has values not covered by income/expense lists: ${uncovered.join(', ')}. Found values: ${typesArray.join(', ')}`,
      });
    }
  }
}
