import type { DisplayUnit, MetricStatus } from './api-types';
import type { ScreeningOperator } from './constants';

/** A condition as sent to the API: `value` is a plain ratio (10% -> 0.10). */
export interface ScreeningCondition {
  metric: string;
  op: ScreeningOperator;
  value: number;
}

export interface ScreeningRequest {
  year: number;
  conditions: ScreeningCondition[];
}

export type ScreeningOutcome = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface ScreeningConditionResult {
  metric: string;
  op: ScreeningOperator;
  threshold: number;
  value: number | null;
  displayValue: number | null;
  unit: DisplayUnit | null;
  metricStatus: MetricStatus | 'NOT_AVAILABLE';
  conditionStatus: ScreeningOutcome;
}

export interface ScreeningRow {
  symbol: string;
  companyName: string;
  overallStatus: ScreeningOutcome;
  passedCount: number;
  failedCount: number;
  unknownCount: number;
  conditions: ScreeningConditionResult[];
}

export interface ScreeningResponse {
  year: number;
  conditions: ScreeningCondition[];
  rows: ScreeningRow[];
}

/** Converts a user threshold expressed in display units into the stored ratio. */
export function toStoredThreshold(displayValue: number, unit: DisplayUnit): number {
  // Round to 12 decimals to avoid binary noise such as 0.1 * 100 / 100 = 0.10000000000000002.
  const raw = unit === 'PERCENT' ? displayValue / 100 : displayValue;
  return Math.round(raw * 1e12) / 1e12;
}

/** Converts a stored ratio threshold into display units (inverse of toStoredThreshold). */
export function toDisplayThreshold(storedValue: number, unit: DisplayUnit): number {
  const raw = unit === 'PERCENT' ? storedValue * 100 : storedValue;
  return Math.round(raw * 1e10) / 1e10;
}
