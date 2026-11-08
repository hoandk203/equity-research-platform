import type { DisplayUnit } from '@erp/contracts';

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

export const unitLabel = (unit: DisplayUnit | null | undefined): string => (unit === 'PERCENT' ? '%' : unit === 'TIMES' ? 'lần' : '');

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
