// Reads the accepted dataset (db/seed/market) and turns it into staging rows for
// pkg_etl_api.stage_market_row / pkg_market_import.stage_row. Shared by load.ts and export-seed.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASET_DIR, MAPPING_CAPITAL, MAPPING_PRICES, MAPPING_SHARES } from './config.ts';
import { readCsv, readJson, sha256 } from './files.ts';

export type Artifact = {
  source_code: string; source_name: string; kind: 'JSON' | 'PDF'; sha256: string; path: string;
  url: string | null; collected_at: string | null; note: string; symbol: string; dataset: string;
};
export type Manifest = {
  contract: string; dataset_version: string; raw_run_id: string;
  review: { version: string; reviewed_by: string; reviewed_at: string };
  capital_provider_artifacts: { symbol: string; sha256: string; url: string; path: string }[];
  artifacts: Artifact[];
  files: Record<string, { sha256: string; rows: number }>;
};
export type StageRow = { rowNo: number; kind: 'PRICE' | 'SHARES' | 'CAPITAL'; symbol: string; key: string; artifactSha: string; payload: string };
export type BatchPlan = { mapping: string; suffix: string; rows: StageRow[] };

export function loadDataset(dir = DATASET_DIR) {
  const manifest = readJson<Manifest>(join(dir, 'manifest.json'));
  for (const [name, meta] of Object.entries(manifest.files)) {
    const actual = sha256(readFileSync(join(dir, name)));
    if (actual !== meta.sha256) throw new Error(`${name}: hash ${actual.slice(0, 12)} differs from manifest ${meta.sha256.slice(0, 12)}`);
  }
  const prices = readCsv(join(dir, 'daily_prices.csv'));
  const shares = readCsv(join(dir, 'share_counts.csv'));
  const capital = readCsv(join(dir, 'capital_facts.csv'));
  const corrections = readCsv(join(dir, 'price_corrections.csv'));
  for (const [name, rows] of [['daily_prices.csv', prices], ['share_counts.csv', shares], ['capital_facts.csv', capital], ['price_corrections.csv', corrections]] as const) {
    if (rows.length !== manifest.files[name].rows) throw new Error(`${name}: ${rows.length} rows, manifest says ${manifest.files[name].rows}`);
  }
  return { manifest, prices, shares, capital, corrections };
}

/** Batches in the mandatory order: capital (needed by the year-end share check), shares, prices. */
export function planBatches(ds: ReturnType<typeof loadDataset>): BatchPlan[] {
  const { manifest } = ds;
  const capitalRows: StageRow[] = ds.capital.map((c, i) => {
    const payload: Record<string, string | number> = {
      symbol: c.symbol, year: c.fiscal_year, item_code: c.item_code, provider_value: c.provider_value, issuer_value: c.issuer_value,
      provider_sha256: c.provider_sha256, issuer_sha256: c.issuer_sha256, evidence_page: c.evidence_page, raw_locator: c.raw_locator,
      source_column: c.source_column, reviewed_by: manifest.review.reviewed_by, reviewed_at: manifest.review.reviewed_at,
      review_version: manifest.review.version,
    };
    if (c.correction_reason) payload.correction_reason = c.correction_reason;
    return { rowNo: i + 1, kind: 'CAPITAL', symbol: c.symbol, key: `${c.fiscal_year}:${c.item_code}`, artifactSha: c.provider_sha256, payload: JSON.stringify(payload) };
  });
  const shareRows: StageRow[] = ds.shares.map((s, i) => ({
    rowNo: i + 1, kind: 'SHARES', symbol: s.symbol, key: s.effective_date, artifactSha: s.artifact_sha256,
    payload: JSON.stringify({ symbol: s.symbol, effective_date: s.effective_date, shares_outstanding: s.shares_outstanding,
      artifact_sha256: s.artifact_sha256, bs_check: s.bs_check }),
  }));
  const corr = new Map<string, Record<string, string>[]>();
  for (const c of ds.corrections) {
    const k = `${c.symbol}|${c.trading_date}`;
    corr.set(k, [...(corr.get(k) ?? []), { field: c.field, provider_value: c.provider_value, accepted_value: c.accepted_value, reason: c.reason, evidence: c.evidence }]);
  }
  const priceRows: StageRow[] = ds.prices.map((p, i) => ({
    rowNo: i + 1, kind: 'PRICE', symbol: p.symbol, key: p.trading_date, artifactSha: p.artifact_sha256,
    payload: JSON.stringify({ symbol: p.symbol, trading_date: p.trading_date, open: p.open, high: p.high, low: p.low, close: p.close,
      adj_open: p.adj_open, adj_high: p.adj_high, adj_low: p.adj_low, adj_close: p.adj_close, volume: p.volume,
      artifact_sha256: p.artifact_sha256, corrections: corr.get(`${p.symbol}|${p.trading_date}`) ?? [] }),
  }));
  const used = new Set(ds.corrections.map((c) => `${c.symbol}|${c.trading_date}`));
  for (const k of used) if (!ds.prices.some((p) => `${p.symbol}|${p.trading_date}` === k)) throw new Error(`correction without session: ${k}`);
  return [
    { mapping: MAPPING_CAPITAL, suffix: 'capital', rows: capitalRows },
    { mapping: MAPPING_SHARES, suffix: 'shares', rows: shareRows },
    { mapping: MAPPING_PRICES, suffix: 'prices', rows: priceRows },
  ];
}
