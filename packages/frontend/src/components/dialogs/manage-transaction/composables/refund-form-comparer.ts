export function areSlicesEqual<T extends object>(obj1: T, obj2: T, keysToCheck?: string[]): boolean {
  const keys = Object.keys(obj1) as (keyof T)[];

  for (const key of keys) {
    const value1 = obj1[key];
    const value2 = obj2[key];

    if (typeof value1 !== typeof value2) {
      return false;
    }

    if (value1 === null || value2 === null) {
      if (value1 !== value2) {
        return false;
      }
    } else if (value1 instanceof Date && value2 instanceof Date) {
      if (value1.getTime() !== value2.getTime()) {
        return false;
      }
    } else if (typeof value1 === 'object' && typeof value2 === 'object') {
      if (keysToCheck && keysToCheck.length > 0) {
        for (const nestedKey of keysToCheck) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((value1 as any)[nestedKey] !== (value2 as any)[nestedKey]) {
            return false;
          }
        }
      } else if (!areSlicesEqual(value1, value2)) {
        return false;
      }
    } else if (value1 !== value2) {
      return false;
    }
  }

  return true;
}
