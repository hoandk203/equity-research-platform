// Build the accepted market dataset (db/seed/market/) from one raw download run.
//   node apps/etl/src/build-dataset.ts [run-id]      (default: latest run in data/market_raw)
// Steps: verify every raw file hash -> normalise VNDirect prices/shares -> reconcile prices
// with CafeF -> reconcile year-end shares with the reviewed balance sheet -> merge the
// capital review with CafeF provider values -> write CSV + manifest + reconciliation report.
// Exits non-zero (and writes nothing) if any check fails without an explanation.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  CONTRACT, DATASET_DIR, FISCAL_YEARS, MAPPING_CAPITAL, MAPPING_PRICES, MAPPING_SHARES,
  PRICE_FROM, PRICE_TO, RAW_ROOT, REVIEW_FILE, ROOT, SYMBOLS,
} from './lib/config.ts';
import { readJson, sha256, sha256File, toCsv, writeJson, writeText } from './lib/files.ts';
import {
  adjudicate, assertOhlc, capitalFromCafef, confirmSessions, normaliseCafef, normaliseSsiBars, normaliseVndPrices, normaliseVndShares,
  reconcilePrices, sharesFromBalanceSheet, type PriceCorrection, type PriceRow, type ShareRow,
} from './lib/market.ts';
import type { RawManifest } from './fetch.ts';

type Review = {
  review_version: string; reviewed_by: string; reviewed_at: string;
  documents: Record<string, { sha256: string; source_code: string }>;
  observations: { symbol: string; year: number; document: string; column: string; share_capital: string; share_capital_page: number;
    treasury_shares: string; non_controlling_interest: string; nci_page: number }[];
  notes: string[];
};

const CAPITAL_PROVIDER_DIR = resolve(process.env.CAPITAL_PROVIDER_DIR ?? join(ROOT, '../Hoc_Sau/data/public_financials_2026-11-05/raw/cafef'));
const CAPITAL_PROVIDER_URL = (s: string) =>
  `https://apiweb.cafef.vn/api/v2/BCTC/GetReportCDKT?symbol=${s}&pageIndex=1&pageSize=50&TypeTime=NAM&reportType=ALL`;

function latestRun(): string {
  const runs = existsSync(RAW_ROOT) ? readdirSync(RAW_ROOT).filter((d) => existsSync(join(RAW_ROOT, d, 'manifest.json'))).sort() : [];
  if (!runs.length) throw new Error('no raw run; run `nx run etl:fetch` first');
  return runs[runs.length - 1];
}

function main() {
  const runId = process.argv[2] ?? latestRun();
  const runDir = join(RAW_ROOT, runId);
  const raw = readJson<RawManifest>(join(runDir, 'manifest.json'));
  for (const f of raw.files) {
    if (sha256File(join(runDir, f.path)) !== f.sha256) throw new Error(`hash mismatch: ${f.path}`);
  }
  const file = (pred: (f: RawManifest['files'][number]) => boolean) => raw.files.filter(pred);
  const load = (rel: string) => JSON.parse(readFileSync(join(runDir, rel), 'utf8'));

  // 1. Prices and shares from VNDirect; CafeF (second) and SSI (third) only for reconciliation.
  const prices: (PriceRow & { artifact_sha256: string })[] = [];
  const shares: (ShareRow & { artifact_sha256: string })[] = [];
  const priceCorrections: PriceCorrection[] = [];
  const recon: Record<string, unknown>[] = [];
  const artifacts: Record<string, unknown>[] = [];
  for (const s of SYMBOLS) {
    const [pf] = file((f) => f.source === 'VNDIRECT' && f.dataset === 'PRICES' && f.symbol === s);
    const [sf] = file((f) => f.source === 'VNDIRECT' && f.dataset === 'SHARES' && f.symbol === s);
    const [tf] = file((f) => f.source === 'SSI' && f.symbol === s);
    const primary = normaliseVndPrices(s, load(pf.path), PRICE_FROM, PRICE_TO);
    const sh = normaliseVndShares(s, load(sf.path), '2022-12-31', PRICE_TO);
    const cafef = normaliseCafef(s, file((f) => f.source === 'CAFEF' && f.symbol === s).map((f) => load(f.path)));
    const ssi = normaliseSsiBars(load(tf.path));
    // Every field-level disagreement is decided with SSI; anything undecided stops the build.
    const adj = adjudicate(primary, cafef, ssi);
    if (adj.unresolved.length) throw new Error(`${s}: unresolved price disagreements ${JSON.stringify(adj.unresolved)}`);
    assertOhlc(adj.rows);
    const r = reconcilePrices(s, adj.rows, cafef);
    // Sessions missing from CafeF must be confirmed by SSI; sessions missing from VNDirect are never accepted.
    const { confirmed, unconfirmed } = confirmSessions(r.only_primary, adj.rows, ssi.map((b) => ({ trading_date: b.trading_date, adj_close: b.c, volume: b.v })));
    if (unconfirmed.length || r.only_second.length) throw new Error(`${s}: session calendars differ ${JSON.stringify({ unconfirmed, only_cafef: r.only_second })}`);
    // After adjudication the only remaining raw/volume differences are CafeF's own (primary kept).
    const kept = new Set(adj.divergences.filter((d) => d.decision === 'KEEP_PRIMARY').map((d) => `${d.trading_date}|${d.field}`));
    const residual = [...r.raw_mismatches.map((m) => `${m.date}|${m.field}`), ...r.volume_mismatches.map((m) => `${m.date}|volume`)].filter((k) => !kept.has(k));
    if (residual.length) throw new Error(`${s}: residual differences ${residual.join(', ')}`);
    // Adjusted closes beyond tolerance are only acceptable on sessions where CafeF's own unadjusted data diverged.
    const divergentDates = new Set(adj.divergences.map((d) => d.trading_date));
    const unexplained = r.adjusted_over_tolerance.filter((x) => !divergentDates.has(x.date));
    if (unexplained.length) throw new Error(`${s}: adjusted close differs beyond tolerance ${JSON.stringify(unexplained)}`);
    priceCorrections.push(...adj.corrections);
    recon.push({
      symbol: s, primary_sessions: r.primary_sessions, cafef_sessions: r.second_sessions, ssi_sessions: ssi.length, compared_with_cafef: r.compared,
      only_primary_confirmed_by_ssi: confirmed, cafef_divergences_primary_kept: adj.divergences.filter((d) => d.decision === 'KEEP_PRIMARY'),
      primary_corrected: adj.corrections.filter((c) => !c.field.startsWith('adj_')).map((c) => `${c.trading_date} ${c.field} ${c.provider_value} -> ${c.accepted_value}`),
      adjusted_max_relative_diff: r.adjusted_max_relative_diff, adjusted_over_tolerance_explained: r.adjusted_over_tolerance,
    });
    prices.push(...adj.rows.map((row) => ({ ...row, artifact_sha256: pf.sha256 })));
    shares.push(...sh.map((row) => ({ ...row, artifact_sha256: sf.sha256 })));
    for (const f of [pf, sf]) {
      artifacts.push({ source_code: 'VNDIRECT', source_name: 'VNDirect finfo API', kind: 'JSON', sha256: f.sha256,
        path: relative(ROOT, join(runDir, f.path)), url: f.url, collected_at: f.collected_at, symbol: s, dataset: f.dataset,
        note: 'Public market-data API; raw bytes stored locally' });
    }
  }

  // 2. Capital items: CafeF provider value vs reviewed issuer value.
  const review = readJson<Review>(REVIEW_FILE);
  const capital: (string | number | null)[][] = [];
  const corrections: string[] = [];
  const providerHashes: Record<string, string> = {};
  for (const s of SYMBOLS) {
    const path = join(CAPITAL_PROVIDER_DIR, s, 'balance_1.json');
    const body = readFileSync(path);
    providerHashes[s] = sha256(body);
    const json = JSON.parse(body.toString('utf8'));
    for (const y of FISCAL_YEARS) {
      const values: Record<string, number> = {};
      for (const sec of json.value.data) for (const row of sec.data) {
        if (row.year === y && row.quater === 0) for (const v of row.data) values[v.code] = v.value;
      }
      const provider = capitalFromCafef(values);
      const obs = review.observations.find((o) => o.symbol === s && o.year === y);
      if (!obs) throw new Error(`${s} ${y}: no capital review observation`);
      const doc = review.documents[obs.document];
      for (const item of ['share_capital', 'treasury_shares', 'non_controlling_interest'] as const) {
        const issuer = BigInt(obs[item]);
        const status = issuer === provider[item] ? 'MATCH' : 'CORRECTED';
        const page = item === 'non_controlling_interest' ? obs.nci_page : obs.share_capital_page;
        const reason = status === 'CORRECTED'
          ? `CafeF ${item} ${provider[item]} differs from audited balance sheet ${issuer} (page ${page}); issuer value used`
          : null;
        if (reason) corrections.push(`${s} ${y} ${item}: ${reason}`);
        const rawCode = { share_capital: values['411a'] ? '411a' : '411', treasury_shares: '415', non_controlling_interest: '429' }[item];
        capital.push([s, y, item, provider[item].toString(), issuer.toString(), status, providerHashes[s], doc.sha256, page,
          `year=${y};type=HK;section=CDKT;code=${rawCode}`, obs.column, reason]);
      }
    }
  }

  // 3. Year-end shares outstanding vs balance-sheet capital / par value.
  const shareChecks: Record<string, unknown>[] = [];
  const shareRows = shares.map((r) => {
    const year = Number(r.effective_date.slice(0, 4));
    let check = 'NOT_YEAR_END';
    if (r.effective_date.endsWith('-12-31')) {
      const cap = capital.find((c) => c[0] === r.symbol && c[1] === year && c[2] === 'share_capital');
      const tre = capital.find((c) => c[0] === r.symbol && c[1] === year && c[2] === 'treasury_shares');
      const implied = cap && tre ? sharesFromBalanceSheet(BigInt(cap[4] as string), BigInt(tre[4] as string)) : null;
      check = implied === null ? 'UNCHECKED' : implied === BigInt(r.shares_outstanding) ? 'MATCHED_BS' : 'MISMATCH';
      shareChecks.push({ symbol: r.symbol, date: r.effective_date, provider: r.shares_outstanding, implied_from_bs: implied?.toString() ?? null, check });
      if (check === 'MISMATCH') throw new Error(`${r.symbol} ${r.effective_date}: shares ${r.shares_outstanding} vs balance sheet ${implied}`);
    }
    return [r.symbol, r.effective_date, r.shares_outstanding, r.artifact_sha256, check];
  });

  // 4. Write the dataset.
  const priceCsv = toCsv(
    ['symbol', 'trading_date', 'open', 'high', 'low', 'close', 'adj_open', 'adj_high', 'adj_low', 'adj_close', 'volume', 'artifact_sha256'],
    prices.map((r) => [r.symbol, r.trading_date, r.open, r.high, r.low, r.close, r.adj_open, r.adj_high, r.adj_low, r.adj_close, r.volume, r.artifact_sha256]),
  );
  const correctionCsv = toCsv(['symbol', 'trading_date', 'field', 'provider_value', 'accepted_value', 'reason', 'evidence'],
    priceCorrections.map((c) => [c.symbol, c.trading_date, c.field, c.provider_value, c.accepted_value, c.reason, c.evidence]));
  const shareCsv = toCsv(['symbol', 'effective_date', 'shares_outstanding', 'artifact_sha256', 'bs_check'], shareRows);
  const capitalCsv = toCsv(['symbol', 'fiscal_year', 'item_code', 'provider_value', 'issuer_value', 'comparison', 'provider_sha256',
    'issuer_sha256', 'evidence_page', 'raw_locator', 'source_column', 'correction_reason'], capital);
  const reconciliation = {
    raw_run_id: runId, primary_source: 'VNDIRECT finfo stock_prices (imported)', second_source: 'CAFEF price history (not imported)',
    third_source: 'SSI chart history: adjudicates every VNDirect/CafeF disagreement and confirms sessions missing from CafeF (not imported)',
    rules: [
      'Unadjusted OHLC and order-matching volume must equal CafeF exactly; otherwise SSI decides.',
      'SSI adjusted prices are rescaled to unadjusted with the factor seen on fields where VNDirect and CafeF agree; the candidate within 0.06% of that value and on a valid HOSE tick wins.',
      'A corrected VNDirect field keeps VNDirect adjustment factor for its adjusted twin; every correction is listed in price_corrections.csv and imported as lineage.',
      'Adjusted close may differ from CafeF by more than 0.5% only on sessions where CafeF unadjusted data itself diverged.',
    ],
    prices: recon,
    ssi_files: file((f) => f.source === 'SSI').map((f) => ({ path: f.path, sha256: f.sha256, url: f.url })),
    cafef_files: file((f) => f.source === 'CAFEF').map((f) => ({ path: f.path, sha256: f.sha256, url: f.url })),
    shares: shareChecks, capital_corrections: corrections, review_notes: review.notes,
  };
  writeText(join(DATASET_DIR, 'daily_prices.csv'), priceCsv);
  writeText(join(DATASET_DIR, 'share_counts.csv'), shareCsv);
  writeText(join(DATASET_DIR, 'capital_facts.csv'), capitalCsv);
  writeText(join(DATASET_DIR, 'price_corrections.csv'), correctionCsv);
  writeJson(join(DATASET_DIR, 'reconciliation.json'), reconciliation);
  writeJson(join(DATASET_DIR, 'manifest.json'), {
    contract: CONTRACT, dataset_version: `market-${runId.slice(0, 8)}`, raw_run_id: runId, price_from: PRICE_FROM, price_to: PRICE_TO,
    mappings: { prices: MAPPING_PRICES, shares: MAPPING_SHARES, capital: MAPPING_CAPITAL },
    price_unit: 'THOUSAND_VND', price_multiplier: 1000, volume: 'order-matching shares (nmVolume)',
    adjusted_basis_note: 'Adjusted series as published by VNDirect on the collection date; re-downloading after a corporate action changes it.',
    review: { version: review.review_version, reviewed_by: review.reviewed_by, reviewed_at: review.reviewed_at },
    capital_provider_artifacts: SYMBOLS.map((s) => ({ symbol: s, sha256: providerHashes[s], url: CAPITAL_PROVIDER_URL(s),
      path: `Hoc_Sau/data/public_financials_2026-11-05/raw/cafef/${s}/balance_1.json` })),
    artifacts,
    files: {
      'daily_prices.csv': { sha256: sha256(priceCsv), rows: prices.length },
      'share_counts.csv': { sha256: sha256(shareCsv), rows: shareRows.length },
      'capital_facts.csv': { sha256: sha256(capitalCsv), rows: capital.length },
      'price_corrections.csv': { sha256: sha256(correctionCsv), rows: priceCorrections.length },
    },
  });
  for (const r of recon) {
    const x = r as { symbol: string; primary_sessions: number; compared_with_cafef: number; only_primary_confirmed_by_ssi: string[];
      cafef_divergences_primary_kept: unknown[]; primary_corrected: string[] };
    console.log(`[etl:build] ${x.symbol}: ${x.primary_sessions} sessions, ${x.compared_with_cafef} compared with CafeF, ` +
      `${x.only_primary_confirmed_by_ssi.length} missing in CafeF confirmed by SSI, ${x.cafef_divergences_primary_kept.length} CafeF divergences (VNDirect kept), ` +
      `${x.primary_corrected.length} VNDirect fields corrected [${x.primary_corrected.join('; ')}]`);
  }
  console.log(`[etl:build] shares ${shareRows.length} rows, year-end checks: ${shareChecks.map((c) => `${c.symbol}@${String(c.date).slice(0, 4)}=${c.check}`).join(' ')}`);
  console.log(`[etl:build] capital ${capital.length} rows, ${corrections.length} corrections`);
  console.log(`[etl:build] -> ${relative(ROOT, DATASET_DIR)}`);
}

try { main(); } catch (e) { console.error('[etl:build] ERROR', (e as Error).message); process.exit(1); }
