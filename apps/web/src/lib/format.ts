import type { DisplayUnit, MarketUnit } from '@erp/contracts';

export const EMPTY = '—';
const vi2 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const viInt = new Intl.NumberFormat('vi-VN');

/**
 * VND (decimal string from the API) in billions, 2 decimals, Vietnamese separators.
 * Uses BigInt for the integer part so precision never depends on float rounding.
 */
export function formatTyDong(vnd: string | null | undefined): string {
  if (vnd == null || vnd === '' || !/^-?\d+$/.test(vnd)) return EMPTY;
  const v = BigInt(vnd);
  const neg = v < BigInt(0);
  const abs = neg ? -v : v;
  // Round half-up to 0.01 billion (= 10,000,000 VND).
  const centi = (abs + BigInt(5000000)) / BigInt(10000000);
  const whole = centi / BigInt(100);
  const frac = Number(centi % BigInt(100));
  const text = `${viInt.format(whole)},${String(frac).padStart(2, '0')}`;
  return neg && centi > BigInt(0) ? `-${text}` : text;
}

/** Full VND with thousands separators, exact. */
export function formatVnd(vnd: string | null | undefined): string {
  if (vnd == null || vnd === '' || !/^-?\d+$/.test(vnd)) return EMPTY;
  return viInt.format(BigInt(vnd));
}

export function formatMoney(vnd: string | null | undefined, mode: 'TY' | 'VND'): string {
  return mode === 'VND' ? formatVnd(vnd) : formatTyDong(vnd);
}

/** Unit shown next to a value or a screening threshold (market cap in billions, prices in thousands). */
export function unitLabel(unit: DisplayUnit | MarketUnit | null | undefined, metric?: string): string {
  if (unit === 'PERCENT') return '%';
  if (unit === 'TIMES') return 'lần';
  if (unit === 'VND') return metric === 'MARKET_CAP' ? 'tỷ đồng' : 'nghìn đồng';
  if (unit === 'VND_PER_SHARE') return 'đồng/cp';
  return '';
}

/** display_value from Oracle is already scaled (x100 for percent) and rounded to 2 decimals. */
export function formatMetric(displayValue: number | null | undefined, unit: DisplayUnit | null | undefined): string {
  if (displayValue == null || Number.isNaN(displayValue)) return EMPTY;
  return `${vi2.format(displayValue)} ${unitLabel(unit)}`.trim();
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(d);
}

export function shortHash(hash: string | null | undefined): string {
  return hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : EMPTY;
}

const vi1 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Price per share in VND: 95800 -> "95.800". */
export function formatPrice(vnd: number | null | undefined): string {
  return vnd == null || Number.isNaN(vnd) ? EMPTY : viInt.format(Math.round(vnd));
}

/** Plain ratio as percent with sign: -0.2506 -> "-25,06 %". */
export function formatPercent(ratio: number | null | undefined, signed = false): string {
  if (ratio == null || Number.isNaN(ratio)) return EMPTY;
  const v = Math.round(ratio * 10000) / 100;
  return `${signed && v > 0 ? '+' : ''}${vi2.format(v)} %`;
}

export function formatTimes(x: number | null | undefined): string {
  return x == null || Number.isNaN(x) ? EMPTY : `${vi2.format(x)} lần`;
}

export function formatVolume(n: number | null | undefined): string {
  return n == null ? EMPTY : viInt.format(n);
}

/** Share count (decimal string) with separators; millions when compact. */
export function formatShares(shares: string | null | undefined, compact = false): string {
  if (shares == null || !/^\d+$/.test(shares)) return EMPTY;
  return compact ? `${vi1.format(Number(shares) / 1e6)} triệu cp` : viInt.format(BigInt(shares));
}

/** YYYY-MM-DD -> dd/mm/yyyy (calendar date, no time zone shift). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return EMPTY;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Any market or valuation value in its natural unit (used by screening and compare). */
export function formatMarketValue(value: number | null | undefined, unit: DisplayUnit | MarketUnit | null | undefined, metric?: string): string {
  if (value == null || Number.isNaN(value)) return EMPTY;
  if (unit === 'PERCENT') return formatPercent(value);
  if (unit === 'TIMES') return formatTimes(value);
  if (unit === 'VND' && metric === 'MARKET_CAP') return `${vi2.format(value / 1e9)} tỷ đồng`;
  if (unit === 'VND') return `${formatPrice(value)} đ`;
  if (unit === 'VND_PER_SHARE') return `${viInt.format(Math.round(value))} đ/cp`;
  return vi2.format(value);
}
