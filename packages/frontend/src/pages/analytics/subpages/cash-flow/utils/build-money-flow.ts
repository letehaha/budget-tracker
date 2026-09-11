import type { CategoryModel, RecordId, endpointsTypes } from '@bt/shared/types';

export const OTHER_NODE_ID = 'other';
export const CASH_NODE_ID = 'cash';
export const DEFICIT_NODE_ID = 'deficit';

export interface MoneyFlowNode {
  id: string;
  name: string;
  color?: string;
  parentName?: string;
  value: number;
  share: number;
  /** Nodes folded into an "other" node, largest first. */
  children?: MoneyFlowNode[];
}

/** Nodes below this share of the total are folded into "other" even when they fit within topN. */
const MIN_SHARE = 0.01;

export interface MoneyFlow {
  income: number;
  expenses: number;
  net: number;
  /** Outflow of the Savings node: net savings, or the invested amount when it is larger. */
  savings: number;
  /** Shortfall covered from outside the period's income (overspend or investing from reserves). */
  deficit: number;
  /** Income sources plus, when the period needed more than it earned, a deficit node. */
  sources: MoneyFlowNode[];
  expenseNodes: MoneyFlowNode[];
  savingsNodes: MoneyFlowNode[];
}

const resolveAncestorAtLevel = ({
  id,
  level,
  categoriesById,
}: {
  id: string;
  level: number;
  categoriesById: Record<string, CategoryModel>;
}): string => {
  const chain: string[] = [];
  let current: CategoryModel | undefined = categoriesById[id];
  while (current && chain.length < 32) {
    chain.unshift(current.id);
    current = current.parentId ? categoriesById[current.parentId] : undefined;
  }
  if (chain.length === 0) return id;
  return chain[Math.min(level, chain.length) - 1]!;
};

const rollUp = ({
  data,
  pick,
  level,
  topN,
  categoriesById,
}: {
  data: endpointsTypes.GetSpendingsByCategoriesByTypeReturnType;
  pick: (entry: endpointsTypes.SpendingStructureByType) => number;
  level: number;
  topN: number;
  categoriesById: Record<string, CategoryModel>;
}): MoneyFlowNode[] => {
  const totals = new Map<string, number>();
  for (const [id, entry] of Object.entries(data)) {
    const amount = pick(entry);
    if (amount <= 0) continue;
    const targetId = resolveAncestorAtLevel({ id, level, categoriesById });
    totals.set(targetId, (totals.get(targetId) ?? 0) + amount);
  }

  const total = [...totals.values()].reduce((sum, v) => sum + v, 0);
  if (total === 0) return [];

  const nodes = [...totals.entries()]
    .map(([id, value]): MoneyFlowNode => {
      const category = categoriesById[id];
      const parent = category?.parentId ? categoriesById[category.parentId] : undefined;
      return {
        id,
        name: category?.name ?? data[id as RecordId]?.name ?? id,
        color: category?.color ?? data[id as RecordId]?.color,
        parentName: parent?.name,
        value,
        share: value / total,
      };
    })
    .sort((a, b) => b.value - a.value);

  const kept = nodes.slice(0, topN).filter((n) => n.share >= MIN_SHARE);
  if (nodes.length - kept.length <= 1) return nodes;

  const rest = nodes.slice(kept.length);
  const restValue = rest.reduce((sum, n) => sum + n.value, 0);
  return [...kept, { id: OTHER_NODE_ID, name: '', value: restValue, share: restValue / total, children: rest }];
};

// Withdrawals (negative nets) are ignored: only money that left the period's cash counts.
const investedByDestination = ({
  contributions,
  ventures,
}: {
  contributions?: endpointsTypes.GetInvestmentContributionsResponse;
  ventures?: endpointsTypes.GetVentureContributionsResponse;
}) => {
  const totals = new Map<string, number>();
  for (const bucket of contributions?.buckets ?? []) {
    for (const slice of bucket.byPortfolio) {
      totals.set(slice.portfolioId, (totals.get(slice.portfolioId) ?? 0) + slice.amount);
    }
  }
  return [
    ...(contributions?.portfolios ?? []).map((p) => ({
      id: p.portfolioId,
      name: p.name,
      value: totals.get(p.portfolioId) ?? 0,
    })),
    ...(ventures ?? []).map((v) => ({ id: v.dealId, name: v.name, value: v.amount })),
  ]
    .filter((n) => n.value > 0)
    .sort((a, b) => b.value - a.value);
};

export const buildMoneyFlow = ({
  data,
  categories,
  contributions,
  ventures,
  sourceLevel,
  expenseLevel,
  topN,
}: {
  data: endpointsTypes.GetSpendingsByCategoriesByTypeReturnType;
  categories: CategoryModel[];
  contributions?: endpointsTypes.GetInvestmentContributionsResponse;
  ventures?: endpointsTypes.GetVentureContributionsResponse;
  sourceLevel: number;
  expenseLevel: number;
  topN: number;
}): MoneyFlow => {
  const categoriesById = Object.fromEntries(categories.map((c) => [c.id, c]));

  const sources = rollUp({ data, pick: (e) => e.income, level: sourceLevel, topN, categoriesById });
  const expenseNodes = rollUp({ data, pick: (e) => e.expense, level: expenseLevel, topN, categoriesById });

  const income = sources.reduce((sum, n) => sum + n.value, 0);
  const expenses = expenseNodes.reduce((sum, n) => sum + n.value, 0);
  const net = income - expenses;

  const invested = investedByDestination({ contributions, ventures });
  const investedTotal = invested.reduce((sum, n) => sum + n.value, 0);
  const savings = Math.max(net, investedTotal, 0);
  const deficit = Math.max(0, expenses + savings - income);
  if (deficit > 0) {
    sources.push({ id: DEFICIT_NODE_ID, name: '', value: deficit, share: 0 });
    for (const node of sources) node.share = node.value / (income + deficit);
  }

  const savingsNodes: MoneyFlowNode[] = invested.map((n) => ({ ...n, share: n.value / savings }));
  const cash = savings - investedTotal;
  if (cash > 0) {
    savingsNodes.push({ id: CASH_NODE_ID, name: '', value: cash, share: cash / savings });
  }

  return { income, expenses, net, savings, deficit, sources, expenseNodes, savingsNodes };
};

export const formatShare = (share: number) => `${Math.round(share * 100)}%`;

const SYNTHETIC_LABEL_KEYS: Record<string, string> = {
  [OTHER_NODE_ID]: 'analytics.cashFlow.composition.other',
  [CASH_NODE_ID]: 'analytics.cashFlow.composition.keptAsCash',
  [DEFICIT_NODE_ID]: 'analytics.cashFlow.composition.deficit',
};

export const nodeLabel = ({ node, t }: { node: MoneyFlowNode; t: (key: string) => string }) => {
  const key = SYNTHETIC_LABEL_KEYS[node.id];
  return key ? t(key) : node.name;
};

export const nodeColor = ({
  node,
  colors,
  fallback,
}: {
  node: MoneyFlowNode;
  colors: { text: string; warningText: string };
  fallback: string;
}) => {
  if (node.id === DEFICIT_NODE_ID) return colors.warningText;
  if (node.id in SYNTHETIC_LABEL_KEYS) return colors.text;
  return node.color ?? fallback;
};
