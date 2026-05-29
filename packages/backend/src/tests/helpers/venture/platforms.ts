import { removeUndefinedKeys } from '@js/helpers';
import { createVenturePlatform as _createVenturePlatform } from '@services/venture/platforms/create.service';
import { deleteVenturePlatform as _deleteVenturePlatform } from '@services/venture/platforms/delete.service';
import { getVenturePlatform as _getVenturePlatform } from '@services/venture/platforms/get.service';
import { listVenturePlatforms as _listVenturePlatforms } from '@services/venture/platforms/list.service';
import { updateVenturePlatform as _updateVenturePlatform } from '@services/venture/platforms/update.service';

import { makeRequest } from '../common';

export function buildVenturePlatformPayload(
  overrides: Partial<Omit<Parameters<typeof _createVenturePlatform>[0], 'userId'>> = {},
): Omit<Parameters<typeof _createVenturePlatform>[0], 'userId'> {
  return {
    name: 'Acme Ventures',
    website: 'https://acme.example',
    description: 'Test platform',
    defaultEntryFeePct: '0.085',
    defaultMgmtFeePct: '0',
    defaultCarryPct: '0.2',
    defaultHurdlePct: '0',
    ...overrides,
  };
}

export async function createVenturePlatform<R extends boolean | undefined = false>({
  payload,
  raw,
}: {
  payload?: Partial<ReturnType<typeof buildVenturePlatformPayload>>;
  raw?: R;
} = {}) {
  return makeRequest<Awaited<ReturnType<typeof _createVenturePlatform>>, R>({
    method: 'post',
    url: '/venture/platforms',
    payload: buildVenturePlatformPayload(payload),
    raw,
  });
}

export async function listVenturePlatforms<R extends boolean | undefined = false>({
  limit,
  offset,
  page,
  raw,
}: {
  limit?: number;
  offset?: number;
  page?: number;
  raw?: R;
} = {}) {
  return makeRequest<
    {
      data: Awaited<ReturnType<typeof _listVenturePlatforms>>;
      pagination: { limit: number; offset: number; page: number };
    },
    R
  >({
    method: 'get',
    url: '/venture/platforms',
    payload: removeUndefinedKeys({ limit, offset, page }),
    raw,
  });
}

export async function getVenturePlatform<R extends boolean | undefined = false>({
  platformId,
  raw,
}: {
  platformId: string;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _getVenturePlatform>>, R>({
    method: 'get',
    url: `/venture/platforms/${platformId}`,
    raw,
  });
}

export async function updateVenturePlatform<R extends boolean | undefined = false>({
  platformId,
  payload,
  raw,
}: {
  platformId: string;
  payload: Partial<ReturnType<typeof buildVenturePlatformPayload>>;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _updateVenturePlatform>>, R>({
    method: 'put',
    url: `/venture/platforms/${platformId}`,
    payload,
    raw,
  });
}

export async function deleteVenturePlatform<R extends boolean | undefined = false>({
  platformId,
  force,
  raw,
}: {
  platformId: string;
  force?: boolean;
  raw?: R;
}) {
  return makeRequest<Awaited<ReturnType<typeof _deleteVenturePlatform>>, R>({
    method: 'delete',
    url: `/venture/platforms/${platformId}`,
    payload: removeUndefinedKeys({ force }),
    raw,
  });
}
