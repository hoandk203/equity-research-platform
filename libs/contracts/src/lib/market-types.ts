/**
 * Prices, market metrics and valuation (contract erp-market/1.0.0, docs/18).
 * Prices per share are numbers in VND; money totals (market cap, earnings, equity) and share
 * counts are decimal strings like the financial API. Ratios are plain numbers (0.15 = 15%).
 * null always means "not available" and must never be rendered as 0.
 */

export type PriceBasis = 'ADJUSTED' | 'UNADJUSTED';
export type PriceInterval = 'day' | 'month';
export type MarketUnit = 'PERCENT' | 'TIMES' | 'VND' | 'VND_PER_SHARE';
export type MarketMetricGroup = 'MARKET' | 'VALUATION';
export type ValuationStatus =
  | 'VALID'
  | 'NO_PRICE'
  | 'NO_SHARES'
  | 'NO_REPORT'
  | 'MISSING_INPUT'
  | 'INPUT_NOT_VERIFIED'
  | 'NEGATIVE_EARNINGS'
  | 'NEGATIVE_BOOK';

export const PRICE_BASES = ['ADJUSTED', 'UNADJUSTED'] as const;
export const PRICE_INTERVALS = ['day', 'month'] as const;
/** Upper bound on bars per request (the full 2022-2025 daily history is 997 sessions). */
export const MAX_PRICE_BARS = 1100;
/** Calendar dates in query strings and responses. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface PriceBar {
  /** Session date (day interval) or first day of the month (month interval). */
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
  /** True when a provider value of this bar was replaced by a reviewed correction. */
  corrected: boolean;
}

export interface PriceCorrectionInfo {
  date: string;
  basis: PriceBasis;
  field: string;
  providerValue: number;
  acceptedValue: number;
  reason: string;
  evidence: string;
}

export interface PriceSeriesResponse {
  symbol: string;
  basis: PriceBasis;
  interval: PriceInterval;
  from: string | null;
  to: string | null;
  /** Range available in the current series, independent of the requested window. */
  firstAvailable: string | null;
  lastAvailable: string | null;
  bars: PriceBar[];
  source: { code: string; sha256: string; url: string | null; batchId: number } | null;
  corrections: PriceCorrectionInfo[];
}

export interface MarketSnapshot {
  symbol: string;
  /** Requested date; the snapshot uses the latest session on or before it. */
  asOf: string;
  tradingDate: string | null;
  sessionNo: number | null;
  close: number | null;
  prevClose: number | null;
  adjClose: number | null;
  /** Adjusted daily return of the session (ex-dates do not look like crashes). */
  change1d: number | null;
  volume: number | null;
  return1m: number | null;
  return3m: number | null;
  return6m: number | null;
  return1y: number | null;
  volatility1y: number | null;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  high52w: number | null;
  low52w: number | null;
  dist52wHigh: number | null;
}

export interface ValuationInputs {
  fiscalYear: number | null;
  parentNetIncome: string | null;
  equity: string | null;
  nonControllingInterest: string | null;
  parentEquity: string | null;
  inputStatus: string | null;
  nciEvidencePage: number | null;
  nciCorrected: boolean;
}

export interface ValuationResponse {
  symbol: string;
  asOf: string;
  tradingDate: string | null;
  policyCode: string | null;
  /** Annual report used under the retrospective policy (publication dates are not verified). */
  reportYear: number | null;
  retrospective: true;
  close: number | null;
  sharesOutstanding: string | null;
  sharesEffectiveDate: string | null;
  sharesCheck: string | null;
  marketCap: string | null;
  eps: number | null;
  pe: number | null;
  bvps: number | null;
  pb: number | null;
  marketCapStatus: ValuationStatus;
  peStatus: ValuationStatus;
  pbStatus: ValuationStatus;
  inputs: ValuationInputs;
}

export interface MarketMetricCatalogItem {
  metricCode: string;
  metricGroup: MarketMetricGroup;
  metricName: string;
  displayUnit: MarketUnit;
  formulaText: string;
  formulaVersion: string;
}

/** Latest market figures shown in the company list. */
export interface CompanyQuote {
  tradingDate: string;
  close: number;
  change1d: number | null;
  marketCap: string | null;
}

export interface CompareMarketCell {
  symbol: string;
  value: number | null;
  status: string;
  tradingDate: string | null;
}

export interface CompareMarketRow {
  metricCode: string;
  metricName: string;
  metricGroup: MarketMetricGroup;
  displayUnit: MarketUnit;
  cells: CompareMarketCell[];
}
