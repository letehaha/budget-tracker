type Primitive = string | number | boolean | null | undefined;

export function removeValuesFromObject<T extends Record<string, unknown>>(
  obj: T,
  valuesToRemove: Primitive[] = [null, undefined],
): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => !valuesToRemove.includes(value as Primitive)),
  ) as T;
}
