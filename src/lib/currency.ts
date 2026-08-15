const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
};

export const CURRENCIES = Object.keys(SYMBOLS);

export function currencySymbol(code: string): string {
  // Falls back to the raw code (e.g. "AED 50" for an imported currency this
  // app doesn't have a symbol for) rather than silently mislabeling it as $.
  return SYMBOLS[code] || `${code} `;
}

/** `₹1,240.50` — two decimals, except for zero-decimal currencies like JPY. */
export function formatMoney(amount: number, code: string): string {
  const fractionDigits = code === 'JPY' ? 0 : 2;
  return `${currencySymbol(code)}${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}
