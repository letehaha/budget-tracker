export const isExist = (v) => v !== undefined;
export const removeUndefinedKeys = <T>(obj: T): T => {
  for (const key in obj) {
    if (
      obj[key] === undefined ||
      (typeof obj[key] === 'number' && isNaN(obj[key] as number)) ||
      // Test for Invalid Date object
      (obj[key] instanceof Date && isNaN(obj[key] as unknown as number))
    ) {
      delete obj[key];
    }
  }

  return obj;
};

export const toSystemFiat = (value) => Math.floor(value * 100);
export const fromSystemFiat = (value) => value / 100;
/**
 * We always select lowest integer value regardless it's positive or negative
 * @param number
 * @returns number
 * @example
 * truncateSystemAmount(5.05) // 5
 * truncateSystemAmount(5.95) // 5
 * truncateSystemAmount(-5.95) // 5
 * truncateSystemAmount(-5.05) // 5
 */
export const truncateSystemAmount = (number) => {
  return number > 0 ? Math.floor(number) : Math.ceil(number);
};

export * from './sequelize';
