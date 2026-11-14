// Download raw market data byte-for-byte and record URL + SHA-256 for every file.
//   node apps/etl/src/fetch.ts            -> data/market_raw/<UTC run id>/
// Primary source: VNDirect finfo API (unadjusted + adjusted OHLC, order-matching volume,
// quarterly shares outstanding). Second source for reconciliation: CafeF price history
// (unadjusted + adjusted close), queried one calendar year at a time (the endpoint caps a
// query at roughly one year). Third source, only to confirm sessions/volumes missing from
// CafeF: SSI iBoard chart history (adjusted OHLC, order-matching volume).
import { join, relative } from 'node:path';
import { FISCAL_YEARS, PRICE_FROM, PRICE_TO, RAW_ROOT, ROOT, SYMBOLS, USER_AGENT } from './lib/config.ts';
import { sha256, writeJson, writeText } from './lib/files.ts';

export type RawFile = {
  path: string; // relative to the run directory
  source: 'VNDIRECT' | 'CAFEF' | 'SSI';
  dataset: 'PRICES' | 'SHARES';
  symbol: string;
  url: string;
  sha256: string;
  bytes: number;
  collected_at: string;
};

export type RawManifest = { run_id: string; created_at: string; price_from: string; price_to: string; files: RawFile[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function download(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      JSON.parse(body); // must be JSON, not a challenge page
      return body;
    } catch (err) {
      if (attempt >= 3) throw new Error(`${url}: ${(err as Error).message}`);
      await sleep(1500 * attempt);
    }
  }
}

const vndPrices = (s: string) =>
  `https://api-finfo.vndirect.com.vn/v4/stock_prices?sort=date&q=code:${s}~date:gte:${PRICE_FROM}~date:lte:${PRICE_TO}&size=2000&page=1`;
const vndShares = (s: string) =>
  `https://api-finfo.vndirect.com.vn/v4/ratios?q=code:${s}~itemCode:51004&sort=reportDate:desc&size=100&fields=code,itemCode,reportDate,value`;
const epoch = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000);
const ssi = (s: string) =>
  `https://iboard-api.ssi.com.vn/statistics/charts/history?resolution=1D&symbol=${s}&from=${epoch(PRICE_FROM)}&to=${epoch(PRICE_TO) + 86_399}`;
const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const cafef = (s: string, from: string, to: string, page: number) =>
  `https://cafef.vn/du-lieu/Ajax/PageNew/DataHistory/PriceHistory.ashx?Symbol=${s}&StartDate=${mdy(from)}&EndDate=${mdy(to)}&PageIndex=${page}&PageSize=30`;

async function main() {
  const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, 'Z');
  const dir = join(RAW_ROOT, runId);
  const files: RawFile[] = [];
  const save = async (rel: string, source: RawFile['source'], dataset: RawFile['dataset'], symbol: string, url: string) => {
    const body = await download(url);
    writeText(join(dir, rel), body);
    files.push({ path: rel, source, dataset, symbol, url, sha256: sha256(body), bytes: Buffer.byteLength(body), collected_at: new Date().toISOString() });
    await sleep(350);
    return body;
  };

  for (const s of SYMBOLS) {
    const p = JSON.parse(await save(`vndirect/prices_${s}.json`, 'VNDIRECT', 'PRICES', s, vndPrices(s)));
    if (p.totalElements !== p.data.length) throw new Error(`${s}: VNDirect returned a partial page (${p.data.length}/${p.totalElements})`);
    await save(`vndirect/shares_${s}.json`, 'VNDIRECT', 'SHARES', s, vndShares(s));
    await save(`ssi/prices_${s}.json`, 'SSI', 'PRICES', s, ssi(s));
    for (const y of FISCAL_YEARS) {
      for (let page = 1; page <= 20; page++) {
        const rel = `cafef/${s}/${y}_p${String(page).padStart(2, '0')}.json`;
        const body = JSON.parse(await save(rel, 'CAFEF', 'PRICES', s, cafef(s, `${y}-01-01`, `${y}-12-31`, page)));
        if (!body.Data?.Data?.length) { files.pop(); break; } // empty trailing page is not evidence
      }
    }
    console.log(`[etl:fetch] ${s}: ${files.filter((f) => f.symbol === s).length} files`);
  }
  const manifest: RawManifest = { run_id: runId, created_at: new Date().toISOString(), price_from: PRICE_FROM, price_to: PRICE_TO, files };
  writeJson(join(dir, 'manifest.json'), manifest);
  console.log(`[etl:fetch] ${files.length} files -> ${relative(ROOT, dir)}`);
}

main().catch((e) => { console.error('[etl:fetch] ERROR', e.message); process.exit(1); });
