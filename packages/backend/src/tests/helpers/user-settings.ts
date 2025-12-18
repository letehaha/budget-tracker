import { AI_PROVIDER } from '@bt/shared/types';
import { editExcludedCategories as apiEditExcludedCategories } from '@root/services/user-settings/edit-excluded-categories';
import { getUserSettings as apiGetUserSettings } from '@root/services/user-settings/get-user-settings';
import { updateUserSettings as apiUpdateUserSettings } from '@root/services/user-settings/update-settings';

import { CustomResponse, makeRequest } from './common';

export async function getUserSettings<R extends boolean | undefined = undefined>({ raw }: { raw?: R }) {
  return makeRequest<Awaited<ReturnType<typeof apiGetUserSettings>>, R>({
    method: 'get',
    url: '/user/settings',
    raw,
  });
}

export async function updateUserSettings<R extends boolean | undefined = undefined>({
  raw,
  ...payload
}: Omit<Parameters<typeof apiUpdateUserSettings>[0], 'userId'> & {
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiUpdateUserSettings>>, R>({
    method: 'put',
    url: '/user/settings',
    payload: payload.settings,
    raw,
  });
}

export async function editExcludedCategories<R extends boolean | undefined = undefined>({
  addIds,
  removeIds,
  raw,
}: Omit<Parameters<typeof apiEditExcludedCategories>[0], 'userId'> & {
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof apiEditExcludedCategories>>, R>({
    method: 'put',
    url: '/user/settings/edit-excluded-categories',
    payload: { addIds, removeIds },
    raw,
  });
}

export async function deleteUserAccount(): Promise<CustomResponse<void>> {
  return makeRequest<void>({
    method: 'delete',
    url: '/user/delete',
  });
}

// AI API Key helpers

interface AiApiKeyInfo {
  provider: AI_PROVIDER;
  createdAt: string;
}

export async function getAiApiKeyStatus<R extends boolean | undefined = undefined>({ raw }: { raw?: R }) {
  return makeRequest<{ hasApiKey: boolean; providers: AiApiKeyInfo[]; defaultProvider: AI_PROVIDER | null }, R>({
    method: 'get',
    url: '/user/settings/ai-api-key',
    raw,
  });
}

export async function setAiApiKey<R extends boolean | undefined = undefined>({
  apiKey,
  provider,
  raw,
}: {
  apiKey: string;
  provider: AI_PROVIDER;
  raw?: R;
}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'put',
    url: '/user/settings/ai-api-key',
    payload: { apiKey, provider },
    raw,
  });
}

export async function deleteAiApiKey<R extends boolean | undefined = undefined>({
  provider,
  raw,
}: {
  provider: AI_PROVIDER;
  raw?: R;
}) {
  return makeRequest<{ success: boolean }, R>({
    method: 'delete',
    url: '/user/settings/ai-api-key',
    payload: { provider },
    raw,
  });
}

export async function deleteAllAiApiKeys<R extends boolean | undefined = undefined>({ raw }: { raw?: R }) {
  return makeRequest<{ success: boolean }, R>({
    method: 'delete',
    url: '/user/settings/ai-api-key/all',
    raw,
  });
}
