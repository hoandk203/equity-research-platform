import type { DisplayUnit, MetricStatus } from './api-types';
import type { MarketUnit, ValuationStatus } from './market-types';
import type { ScreeningOperator } from './constants';

/** A condition as sent to the API: `value` is a plain ratio (10% -> 0.10). */
export interface ScreeningCondition {
  metric: string;
  op: ScreeningOperator;
  value: number;
}

/**
 * Either `year` (financial metrics of that fiscal year, legacy behaviour) or `date`
 * (financial + valuation + market metrics at the latest session on or before the date;
 * financial metrics use the report year of the retrospective valuation policy).
 */
export interface ScreeningRequest {
  year?: number;
  date?: string;
  conditions: ScreeningCondition[];
}

export type ScreeningMetricGroup = 'FINANCIAL' | 'MARKET' | 'VALUATION';

export type ScreeningOutcome = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface ScreeningConditionResult {
  metric: string;
  op: ScreeningOperator;
  threshold: number;
  value: number | null;
  displayValue: number | null;
  unit: DisplayUnit | MarketUnit | null;
  metricStatus: MetricStatus | ValuationStatus | 'NOT_AVAILABLE' | 'INSUFFICIENT_HISTORY';
  conditionStatus: ScreeningOutcome;
  group: ScreeningMetricGroup;
}

export interface ScreeningRow {
  symbol: string;
  companyName: string;
  overallStatus: ScreeningOutcome;
  passedCount: number;
  failedCount: number;
  unknownCount: number;
  conditions: ScreeningConditionResult[];
  /** Date mode only: session used for this company and the report year of financial metrics. */
  tradingDate: string | null;
  reportYear: number | null;
}

export interface ScreeningResponse {
  /** Fiscal year (year mode) or the report year applied on `date` (date mode). */
  year: number | null;
  date: string | null;
  conditions: ScreeningCondition[];
  rows: ScreeningRow[];
}

/**
 * How a threshold is typed in the form for each unit: percent points, times, billion VND
 * (market cap), thousand VND (prices) or VND per share.
 */
export const INPUT_SCALE: Record<DisplayUnit | MarketUnit, number> = {
  PERCENT: 100,
  TIMES: 1,
  VND: 1,
  VND_PER_SHARE: 1,
};

/** Market-cap thresholds are typed in billion VND; prices per share in thousand VND. */
export function inputScale(unit: DisplayUnit | MarketUnit, metric?: string): number {
  if (unit === 'VND') return metric === 'MARKET_CAP' ? 1e-9 : 1e-3;
  return INPUT_SCALE[unit];
}

/** Converts a user threshold expressed in display units into the stored value. */
export function toStoredThreshold(displayValue: number, unit: DisplayUnit | MarketUnit, metric?: string): number {
  // Round to 12 significant decimals to avoid binary noise such as 0.1 * 100 / 100 = 0.10000000000000002.
  const raw = displayValue / inputScale(unit, metric);
  return Math.abs(raw) >= 1 ? Math.round(raw * 1e6) / 1e6 : Math.round(raw * 1e12) / 1e12;
}

/** Converts a stored threshold into display units (inverse of toStoredThreshold). */
export function toDisplayThreshold(storedValue: number, unit: DisplayUnit | MarketUnit, metric?: string): number {
  const raw = storedValue * inputScale(unit, metric);
  return Math.round(raw * 1e10) / 1e10;
}
