import type {
  AutomationAction,
  AutomationConditions,
  AutomationPreviewResult,
  RecordId,
  TransactionAutomationModel,
} from '@bt/shared/types';

import { makeRequest } from './common';

export interface CreateAutomationPayload {
  name: string;
  isEnabled?: boolean;
  conditions: AutomationConditions;
  actions: AutomationAction[];
}

export type UpdateAutomationPayload = Partial<CreateAutomationPayload>;

export async function createAutomation<R extends boolean | undefined = undefined>({
  payload,
  raw,
}: {
  payload: CreateAutomationPayload;
  raw?: R;
}) {
  return makeRequest<TransactionAutomationModel, R>({
    method: 'post',
    url: '/automations',
    payload,
    raw,
  });
}

export async function listAutomations<R extends boolean | undefined = undefined>({ raw }: { raw?: R } = {}) {
  return makeRequest<TransactionAutomationModel[], R>({
    method: 'get',
    url: '/automations',
    raw,
  });
}

export const getAutomationById = async ({ id }: { id: RecordId }) =>
  (await listAutomations({ raw: true })).find((rule) => rule.id === id);

export async function updateAutomation<R extends boolean | undefined = undefined>({
  id,
  payload,
  raw,
}: {
  id: RecordId;
  payload: UpdateAutomationPayload;
  raw?: R;
}) {
  return makeRequest<TransactionAutomationModel, R>({
    method: 'patch',
    url: `/automations/${id}`,
    payload,
    raw,
  });
}

export async function deleteAutomation<R extends boolean | undefined = undefined>({
  id,
  raw,
}: {
  id: RecordId;
  raw?: R;
}) {
  return makeRequest<void, R>({
    method: 'delete',
    url: `/automations/${id}`,
    raw,
  });
}

export async function reorderAutomations<R extends boolean | undefined = undefined>({
  payload,
  raw,
}: {
  payload: { ids: RecordId[] };
  raw?: R;
}) {
  return makeRequest<TransactionAutomationModel[], R>({
    method: 'put',
    url: '/automations/reorder',
    payload,
    raw,
  });
}

export async function previewAutomation<R extends boolean | undefined = undefined>({
  payload,
  raw,
}: {
  payload: { conditions: AutomationConditions };
  raw?: R;
}) {
  return makeRequest<AutomationPreviewResult, R>({
    method: 'post',
    url: '/automations/preview',
    payload,
    raw,
  });
}

export function buildAutomationPayload(overrides: Partial<CreateAutomationPayload> = {}): CreateAutomationPayload {
  return {
    name: 'Test automation',
    conditions: { match: 'all', items: [{ field: 'note', operator: 'contains_any', value: ['uber'] }] },
    actions: [{ type: 'set_note', mode: 'append', value: 'automated' }],
    ...overrides,
  };
}
