export function removeNullishValues<T extends object>(obj: T): Partial<T> {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value === null || value === undefined) {
      return acc;
    }
    acc[key as keyof T] = value;
    return acc;
  }, {} as Partial<T>);
}
