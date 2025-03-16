export const amount = (value: number | string): boolean => Number.isFinite(value) && Number(value) > 0;
// eslint-disable-next-line vue/max-len
export const maxDecimalPoints =
  (points: number | string) =>
  (value: number | string): boolean => {
    const number = parseFloat(String(value));

    if (!number || !Number.isFinite(number) || typeof number !== 'number') return false;

    const splittedValue = String(number).split('.');
    if (splittedValue.length < 2) {
      return true;
    }
    return splittedValue[splittedValue.length - 1].length <= Number(points);
  };
export const requiredToBeTrue = (value: unknown): boolean => value === true;

export * from '@vuelidate/validators';
