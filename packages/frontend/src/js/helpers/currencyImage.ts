export function getCurrencyIcon(currencyCode: string): string {
  if (!currencyCode || typeof currencyCode !== 'string') {
    throw new Error('Currency code must be a non-empty string.');
  }

  const formattedCode = currencyCode.trim().toLowerCase();

  return `https://wise.com/web-art/assets/flags/${formattedCode}.svg`;
}
