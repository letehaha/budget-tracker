import { CategoryModel } from '@bt/shared/types';
import * as helpers from '@tests/helpers';
import { Response } from 'express';

interface BaseCreationPayload {
  parentId?: number;
  name?: string;
  color?: string;
}
export async function addCustomCategory({ raw, ...params }: BaseCreationPayload & { raw?: false }): Promise<Response>;
export async function addCustomCategory({
  raw,
  ...params
}: BaseCreationPayload & { raw?: true }): Promise<CategoryModel>;
export async function addCustomCategory({
  raw = true,
  ...params
}: BaseCreationPayload & {
  raw?: boolean;
}): Promise<Response | CategoryModel> {
  const result = await helpers.makeRequest({
    method: 'post',
    url: '/categories',
    payload: params,
    raw,
  });

  return result;
}

interface BaseUpdationPayload {
  categoryId: number;
  name?: string;
  color?: string;
  icon?: string | null;
}
export async function editCustomCategory({ raw, ...params }: BaseUpdationPayload & { raw?: false }): Promise<Response>;
export async function editCustomCategory({
  raw,
  ...params
}: BaseUpdationPayload & { raw?: true }): Promise<CategoryModel[]>;
export async function editCustomCategory({
  categoryId,
  raw = true,
  ...params
}: BaseUpdationPayload & {
  raw?: boolean;
}): Promise<Response | CategoryModel[]> {
  const result = await helpers.makeRequest({
    method: 'put',
    url: `/categories/${categoryId}`,
    payload: params,
    raw,
  });

  return result;
}

export const getCategoriesList = async (): Promise<CategoryModel[]> => {
  const result = await helpers.makeRequest({
    method: 'get',
    url: '/categories',
    raw: true,
  });

  return result;
};

export async function deleteCustomCategory({
  raw,
  ...params
}: {
  categoryId?: number | string;
  raw?: false;
}): Promise<Response>;
export async function deleteCustomCategory({
  raw,
  ...params
}: {
  categoryId?: number | string;
  raw?: true;
}): Promise<CategoryModel[]>;
export async function deleteCustomCategory({
  categoryId,
  raw = true,
}: {
  categoryId?: number | string;
  raw?: boolean;
}): Promise<Response | CategoryModel[]> {
  const result = await helpers.makeRequest({
    method: 'delete',
    url: `/categories/${categoryId}`,
    raw,
  });

  return result;
}
