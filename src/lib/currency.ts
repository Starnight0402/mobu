const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
};

export const CURRENCIES = Object.keys(SYMBOLS);

export function currencySymbol(code: string): string {
  return SYMBOLS[code] || '$';
}

/** `₹1,240.50` — two decimals, except for zero-decimal currencies like JPY. */
export function formatMoney(amount: number, code: string): string {
  const fractionDigits = code === 'JPY' ? 0 : 2;
  return `${currencySymbol(code)}${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}
