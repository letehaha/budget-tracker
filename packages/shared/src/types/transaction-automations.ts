import { TRANSACTION_TYPES } from './enums';
import { RecordId } from './record-id';

export const AUTOMATION_TEXT_OPERATORS = [
  'contains_any',
  'not_contains_any',
  'starts_with_any',
  'ends_with_any',
  'equals_any',
  'is_empty',
] as const;
export type AutomationTextOperator = (typeof AUTOMATION_TEXT_OPERATORS)[number];

export const AUTOMATION_AMOUNT_OPERATORS = ['gte', 'lte', 'between', 'equals'] as const;
export type AutomationAmountOperator = (typeof AUTOMATION_AMOUNT_OPERATORS)[number];

export const AUTOMATION_LIST_OPERATORS = ['in', 'not_in'] as const;
export type AutomationListOperator = (typeof AUTOMATION_LIST_OPERATORS)[number];

export const AUTOMATION_NOTE_MODES = ['replace', 'append', 'prepend'] as const;
export type AutomationNoteMode = (typeof AUTOMATION_NOTE_MODES)[number];

export type AutomationAmountCurrency = { mode: 'transaction' } | { mode: 'base' } | { mode: 'specific'; code: string };

export type AutomationCondition =
  | { field: 'note'; operator: AutomationTextOperator; value: string[] }
  | { field: 'merchant'; operator: AutomationTextOperator; value: string[] }
  | { field: 'payee'; operator: AutomationListOperator; value: RecordId[] }
  | {
      field: 'amount';
      operator: AutomationAmountOperator;
      value: { min?: number; max?: number };
      currency: AutomationAmountCurrency;
    }
  | { field: 'transactionType'; operator: 'equals'; value: TRANSACTION_TYPES }
  | { field: 'account'; operator: AutomationListOperator; value: RecordId[] }
  | { field: 'accountGroup'; operator: AutomationListOperator; value: RecordId[] }
  | { field: 'bankConnection'; operator: AutomationListOperator; value: RecordId[] }
  | { field: 'dayOfMonth'; operator: 'between'; value: { min: number; max: number } };

export type AutomationConditionField = AutomationCondition['field'];

export interface AutomationConditions {
  match: 'all' | 'any';
  items: AutomationCondition[];
}

export type AutomationAction =
  | { type: 'set_category'; categoryId: RecordId }
  | { type: 'add_tags'; tagIds: RecordId[] }
  | { type: 'set_payee'; payeeId: RecordId }
  | { type: 'set_note'; mode: AutomationNoteMode; value: string };

export type AutomationActionType = AutomationAction['type'];

export type AutomationRefType = 'category' | 'tag' | 'account' | 'accountGroup' | 'bankConnection' | 'payee';

export interface AutomationPausedReason {
  kind: 'missing_reference';
  refType: AutomationRefType;
  refId: RecordId;
  label: string;
  at: string;
}

export interface TransactionAutomationModel {
  id: RecordId;
  userId: number;
  name: string;
  isEnabled: boolean;
  position: number;
  conditions: AutomationConditions;
  actions: AutomationAction[];
  matchCount: number;
  lastMatchedAt: string | null;
  pausedReason: AutomationPausedReason | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationPreviewMatch {
  id: RecordId;
  time: string;
  note: string | null;
  accountId: RecordId;
  categoryId: RecordId;
  amount: number;
  currencyCode: string;
  transactionType: TRANSACTION_TYPES;
}

export interface AutomationPreviewResult {
  matchedCount: number;
  scannedCount: number;
  matches: AutomationPreviewMatch[];
}

export const AUTOMATION_LIMITS = {
  maxRules: 100,
  maxConditions: 10,
  maxKeywords: 20,
  maxKeywordLength: 64,
  maxIds: 20,
  maxActions: 4,
  maxNoteLength: 200,
  maxNameLength: 120,
} as const;
