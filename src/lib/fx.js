// Hardcoded FX rates. Update manually here, or hook to a live API in Phase 2.
// All values = "1 unit of CURRENCY in USD"
export const FX_RATES = {
  USD: 1.00,
  EUR: 1.08,
  GBP: 1.27,
  JPY: 0.0065,
  TWD: 0.031,
  CNY: 0.14,
  AUD: 0.66,
  CAD: 0.73,
};

export const FX_LAST_UPDATED = "2026-05-01"; // bump when you edit rates

export function toUSD(amount, currency) {
  const rate = FX_RATES[currency];
  if (rate === undefined) return amount; // unknown currency, assume already USD
  return amount * rate;
}

export const fmtUSD = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return "$—";
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 10_000)    return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

// Compact number formatter for KPI cards (e.g. 12.4K, 1.2M)
export const fmtCompact = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000)    return `${(n / 1_000).toFixed(1)}K`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
