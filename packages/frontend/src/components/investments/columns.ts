export enum INVESTMENT_TX_COLUMN {
  date = 'date',
  type = 'type',
  quantity = 'quantity',
  price = 'price',
  fees = 'fees',
  amount = 'amount',
  note = 'note',
  refAmount = 'refAmount',
  refFees = 'refFees',
  settlementAmount = 'settlementAmount',
  settlementCurrency = 'settlementCurrency',
  settlementFees = 'settlementFees',
  settlementRate = 'settlementRate',
  createdAt = 'createdAt',
}

export interface InvestmentTxColumnDefinition {
  id: INVESTMENT_TX_COLUMN;
  labelKey: string;
  align: 'left' | 'right';
  /** Minimum track width in rem; also feeds the table's total min width. */
  minRem: number;
  /** Grid track: growing columns share free space via 1fr, fixed ones stay at minRem. */
  gridSize: string;
  /** Header tooltip i18n key for columns whose currency/meaning isn't obvious. */
  tooltipKey?: string;
}

const defineColumn = ({
  id,
  labelKey,
  align,
  minRem,
  grow = false,
  tooltipKey,
}: Omit<InvestmentTxColumnDefinition, 'gridSize'> & { grow?: boolean }): InvestmentTxColumnDefinition => ({
  id,
  labelKey,
  align,
  minRem,
  gridSize: grow ? `minmax(${minRem}rem, 1fr)` : `${minRem}rem`,
  tooltipKey,
});

const COLUMN_DEFINITIONS: InvestmentTxColumnDefinition[] = [
  defineColumn({
    id: INVESTMENT_TX_COLUMN.date,
    labelKey: 'portfolioDetail.transactionsList.headers.date',
    align: 'left',
    minRem: 6,
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.type,
    labelKey: 'portfolioDetail.transactionsList.headers.type',
    align: 'left',
    minRem: 4,
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.quantity,
    labelKey: 'portfolioDetail.transactionsList.headers.quantity',
    align: 'right',
    minRem: 4,
    grow: true,
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.price,
    labelKey: 'portfolioDetail.transactionsList.headers.price',
    align: 'right',
    minRem: 6,
    grow: true,
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.fees,
    labelKey: 'portfolioDetail.transactionsList.headers.fees',
    align: 'right',
    minRem: 3,
    grow: true,
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.amount,
    labelKey: 'portfolioDetail.transactionsList.headers.amount',
    align: 'right',
    minRem: 7,
    grow: true,
    tooltipKey: 'portfolioDetail.transactionsList.headerTooltips.amount',
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.note,
    labelKey: 'portfolioDetail.transactionsList.headers.note',
    align: 'right',
    minRem: 8,
    grow: true,
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.refAmount,
    labelKey: 'portfolioDetail.transactionsList.headers.refAmount',
    align: 'right',
    minRem: 7,
    grow: true,
    tooltipKey: 'portfolioDetail.transactionsList.headerTooltips.refAmount',
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.refFees,
    labelKey: 'portfolioDetail.transactionsList.headers.refFees',
    align: 'right',
    minRem: 6,
    grow: true,
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.settlementAmount,
    labelKey: 'portfolioDetail.transactionsList.headers.settlementAmount',
    align: 'right',
    minRem: 8,
    grow: true,
    tooltipKey: 'portfolioDetail.transactionsList.headerTooltips.settlementAmount',
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.settlementCurrency,
    labelKey: 'portfolioDetail.transactionsList.headers.settlementCurrency',
    align: 'right',
    minRem: 5,
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.settlementFees,
    labelKey: 'portfolioDetail.transactionsList.headers.settlementFees',
    align: 'right',
    minRem: 6,
    grow: true,
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.settlementRate,
    labelKey: 'portfolioDetail.transactionsList.headers.settlementRate',
    align: 'right',
    minRem: 6,
  }),
  defineColumn({
    id: INVESTMENT_TX_COLUMN.createdAt,
    labelKey: 'portfolioDetail.transactionsList.headers.createdAt',
    align: 'left',
    minRem: 6,
  }),
];

export const DEFAULT_COLUMN_ORDER: INVESTMENT_TX_COLUMN[] = COLUMN_DEFINITIONS.map((d) => d.id);

/** Default visible set keeps the legacy table shape — extras are opt-in. */
export const DEFAULT_VISIBLE_COLUMNS: INVESTMENT_TX_COLUMN[] = [
  INVESTMENT_TX_COLUMN.date,
  INVESTMENT_TX_COLUMN.type,
  INVESTMENT_TX_COLUMN.quantity,
  INVESTMENT_TX_COLUMN.price,
  INVESTMENT_TX_COLUMN.fees,
  INVESTMENT_TX_COLUMN.amount,
  INVESTMENT_TX_COLUMN.note,
];

export const COLUMN_DEFINITIONS_BY_ID: Record<INVESTMENT_TX_COLUMN, InvestmentTxColumnDefinition> = Object.fromEntries(
  COLUMN_DEFINITIONS.map((definition) => [definition.id, definition]),
) as Record<INVESTMENT_TX_COLUMN, InvestmentTxColumnDefinition>;

export const isKnownColumnId = (id: string): id is INVESTMENT_TX_COLUMN => id in COLUMN_DEFINITIONS_BY_ID;
