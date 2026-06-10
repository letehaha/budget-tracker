import { SORT_DIRECTIONS, TRANSACTION_SORT_FIELD } from '@bt/shared/types';

export interface TableSorting {
  sortBy: TRANSACTION_SORT_FIELD;
  order: SORT_DIRECTIONS;
}

export const DEFAULT_SORTING: TableSorting = {
  sortBy: TRANSACTION_SORT_FIELD.time,
  order: SORT_DIRECTIONS.desc,
};

export enum TABLE_COLUMN {
  date = 'date',
  account = 'account',
  category = 'category',
  payee = 'payee',
  amount = 'amount',
  refAmount = 'refAmount',
  note = 'note',
  tags = 'tags',
  categorizationSource = 'categorizationSource',
  group = 'group',
  refundIndicator = 'refundIndicator',
  splitIndicator = 'splitIndicator',
}

export interface ColumnDefinition {
  id: TABLE_COLUMN;
  labelKey: string;
  /** Backend sort field; undefined = column is not sortable. */
  sortField?: TRANSACTION_SORT_FIELD;
  /**
   * Fixed column width. The table uses table-fixed layout so virtualized rows
   * mounting during scroll can never re-measure (and widen) columns.
   */
  widthPx: number;
  align: 'left' | 'right';
}

/**
 * Registry of every column the transactions table can render, in default order.
 * The Amount column sorts by refAmount on purpose: raw multi-currency amounts
 * have no meaningful order (1,000,000 IDR would outrank 1,000 USD).
 */
export const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  {
    id: TABLE_COLUMN.date,
    labelKey: 'transactions.table.columns.date',
    sortField: TRANSACTION_SORT_FIELD.time,
    widthPx: 112,
    align: 'left',
  },
  {
    id: TABLE_COLUMN.account,
    labelKey: 'transactions.table.columns.account',
    sortField: TRANSACTION_SORT_FIELD.accountName,
    widthPx: 176,
    align: 'left',
  },
  {
    id: TABLE_COLUMN.category,
    labelKey: 'transactions.table.columns.category',
    sortField: TRANSACTION_SORT_FIELD.categoryName,
    widthPx: 144,
    align: 'left',
  },
  {
    id: TABLE_COLUMN.payee,
    labelKey: 'transactions.table.columns.payee',
    sortField: TRANSACTION_SORT_FIELD.payeeName,
    widthPx: 128,
    align: 'left',
  },
  {
    id: TABLE_COLUMN.amount,
    labelKey: 'transactions.table.columns.amount',
    sortField: TRANSACTION_SORT_FIELD.refAmount,
    widthPx: 128,
    align: 'right',
  },
  {
    id: TABLE_COLUMN.refAmount,
    labelKey: 'transactions.table.columns.refAmount',
    sortField: TRANSACTION_SORT_FIELD.refAmount,
    widthPx: 128,
    align: 'right',
  },
  {
    id: TABLE_COLUMN.note,
    labelKey: 'transactions.table.columns.note',
    widthPx: 192,
    align: 'left',
  },
  {
    id: TABLE_COLUMN.tags,
    labelKey: 'transactions.table.columns.tags',
    widthPx: 144,
    align: 'left',
  },
  {
    id: TABLE_COLUMN.categorizationSource,
    labelKey: 'transactions.table.columns.categorizationSource',
    sortField: TRANSACTION_SORT_FIELD.categorizationSource,
    widthPx: 160,
    align: 'left',
  },
  {
    id: TABLE_COLUMN.group,
    labelKey: 'transactions.table.columns.group',
    widthPx: 144,
    align: 'left',
  },
  {
    id: TABLE_COLUMN.refundIndicator,
    labelKey: 'transactions.table.columns.refund',
    widthPx: 80,
    align: 'left',
  },
  {
    id: TABLE_COLUMN.splitIndicator,
    labelKey: 'transactions.table.columns.split',
    widthPx: 80,
    align: 'left',
  },
];

/** All column ids in registry order — the order used before any user reordering. */
export const DEFAULT_COLUMN_ORDER: TABLE_COLUMN[] = COLUMN_DEFINITIONS.map((definition) => definition.id);

export const DEFAULT_VISIBLE_COLUMNS: TABLE_COLUMN[] = [
  TABLE_COLUMN.date,
  TABLE_COLUMN.account,
  TABLE_COLUMN.category,
  TABLE_COLUMN.payee,
  TABLE_COLUMN.amount,
  TABLE_COLUMN.refAmount,
  TABLE_COLUMN.note,
  TABLE_COLUMN.tags,
];

export const COLUMN_DEFINITIONS_BY_ID: Record<TABLE_COLUMN, ColumnDefinition> = Object.fromEntries(
  COLUMN_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<TABLE_COLUMN, ColumnDefinition>;

export const isKnownColumnId = (id: string): id is TABLE_COLUMN => id in COLUMN_DEFINITIONS_BY_ID;
