import { API_ERROR_CODES, CategoryModel } from '@bt/shared/types';

export * from './binance-response';

export interface ApiBaseError {
  statusText?: string;
  code: API_ERROR_CODES;
  message?: string;
}

/** @public for Knip */
export enum KEYBOARD_CODES {
  plus = 43,
  minus = 45,
  equal = 61,
  keyE = 101,
  enter = 13,
  escape = 27,
  arrowLeft = 37,
  arrowTop = 38,
  arrowRight = 39,
  arrowBottom = 40,
}

export interface FormattedCategory extends CategoryModel {
  subCategories: FormattedCategory[];
}
