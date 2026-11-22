/**
 * Platform currency.
 *
 * Stays are priced in the operating region's currency (Bangladeshi Taka for the
 * Bangladesh launch), so the code and symbol are single-sourced here instead of
 * being repeated as literals across the quote engine, persistence defaults, and
 * the clients. `initCurrency()` lets a deployment override both from the
 * environment without a code change.
 */

export interface CurrencyConfig {
  /** ISO 4217 code, e.g. `BDT`. */
  code: string;
  /** Display symbol, e.g. `৳`. */
  symbol: string;
}

const DEFAULT_CURRENCY: CurrencyConfig = { code: 'BDT', symbol: '৳' };

let active: CurrencyConfig = { ...DEFAULT_CURRENCY };

/** Applies `CURRENCY_CODE` / `CURRENCY_SYMBOL` when the process defines them. */
export function initCurrency(): CurrencyConfig {
  const code = process.env.CURRENCY_CODE?.trim();
  const symbol = process.env.CURRENCY_SYMBOL?.trim();

  active = {
    code: code ? code.toUpperCase() : DEFAULT_CURRENCY.code,
    symbol: symbol || DEFAULT_CURRENCY.symbol,
  };

  return active;
}

export function getCurrency(): CurrencyConfig {
  return active;
}

export function currencyCode(): string {
  return active.code;
}

export function currencySymbol(): string {
  return active.symbol;
}

export { DEFAULT_CURRENCY };
