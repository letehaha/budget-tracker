import { API_ERROR_CODES, CategoryModel } from '@bt/shared/types';

export * from './binance-response';

export interface ApiBaseError {
  statusText?: string;
  code: API_ERROR_CODES;
  message?: string;
  details?: Record<string, unknown>;
}

export interface FormattedCategory extends CategoryModel {
  subCategories: FormattedCategory[];
}
