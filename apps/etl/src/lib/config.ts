// Shared constants for the market-data ETL (contract erp-market/1.0.0).
// Runs directly with Node >= 23.6 (type stripping): no enums, no parameter properties,
// relative imports keep their .ts extension.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
export const SYMBOLS = ['FPT', 'HPG', 'VNM'] as const;
export type Symbol = (typeof SYMBOLS)[number];

/** Price history window. 2022 is the warm-up year for 52-week / 200-session windows. */
export const PRICE_FROM = '2022-01-01';
export const PRICE_TO = '2025-12-31';
export const FISCAL_YEARS = [2022, 2023, 2024, 2025] as const;

export const CONTRACT = 'erp-market/1.0.0';
export const MAPPING_PRICES = 'vndirect-prices/1.0.0';
export const MAPPING_SHARES = 'vndirect-shares/1.0.0';
export const MAPPING_CAPITAL = 'capital-review/1.0.0';

/** Raw downloads are local only (data/ is git-ignored); the accepted dataset lives in the repo. */
export const RAW_ROOT = resolve(ROOT, 'data/market_raw');
export const DATASET_DIR = resolve(ROOT, 'db/seed/market');
export const REVIEW_FILE = resolve(ROOT, 'apps/etl/review/capital_review.json');

export const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) equity-research-platform-etl/0.1';

/** Tolerances used when the second source is compared with the primary one. */
export const TOLERANCE = {
  /** Unadjusted prices are exchange prices in thousand VND with at most 2 decimals. */
  rawPrice: 0.0001,
  /** Adjusted series are rounded differently by each provider (CafeF 2 decimals). */
  adjustedRelative: 0.005,
  /** Order-matching volume must be identical. */
  volume: 0,
};
