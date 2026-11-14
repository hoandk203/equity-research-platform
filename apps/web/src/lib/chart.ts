import type { PriceBar } from '@erp/contracts';

/** Chart ranges offered on the price tab (URL value -> months back from the last session). */
export const RANGES = [
  { id: '1T', label: '1 tháng', months: 1 },
  { id: '3T', label: '3 tháng', months: 3 },
  { id: '6T', label: '6 tháng', months: 6 },
  { id: '1N', label: '1 năm', months: 12 },
  { id: '3N', label: '3 năm', months: 36 },
  { id: 'TC', label: 'Tất cả', months: null },
] as const;
export type RangeId = (typeof RANGES)[number]['id'];
export const DEFAULT_RANGE: RangeId = '1N';
export const MA_WINDOWS = [20, 50, 200] as const;

export function parseRange(value: string | null | undefined): RangeId {
  return (RANGES.find((r) => r.id === value)?.id ?? DEFAULT_RANGE) as RangeId;
}

/** First calendar date of the visible window ending at `last` (YYYY-MM-DD), or null for all. */
export function rangeStart(last: string, range: RangeId): string | null {
  const months = RANGES.find((r) => r.id === range)?.months ?? null;
  if (months === null) return null;
  const d = new Date(`${last}T00:00:00Z`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate()));
  // Clamp to the last day of the target month (31/03 minus 1 month -> 28/02 or 29/02).
  if (target.getUTCMonth() !== (((d.getUTCMonth() - months) % 12) + 12) % 12) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/**
 * Simple moving average of the close over `window` sessions, only where the window is full
 * (same rule as mv_market_daily: no partial-window values).
 */
export function movingAverage(bars: Pick<PriceBar, 'date' | 'close'>[], window: number): Array<{ time: string; value: number }> {
  const out: Array<{ time: string; value: number }> = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= window) sum -= bars[i - window].close;
    if (i >= window - 1) out.push({ time: bars[i].date, value: sum / window });
  }
  return out;
}
