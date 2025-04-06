/**
 * Converts passed value to the system one, since system does not have decimals
 *
 * @param {Number} value
 * @returns Correct system amount with no decimals
 */
export function toSystemAmount(value: number): number {
  return Number((value * 100).toFixed(0));
}

/**
 *
 * @param value
 * @returns System value which might be displayed to the user
 */
export function fromSystemAmount(value: number): number {
  return value / 100;
}
