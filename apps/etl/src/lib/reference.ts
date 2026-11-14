// Independent reference implementation of market-formula/1.0.0 (docs/18 section 2), written
// in TypeScript from the CSV dataset only. The database computes the same figures with SQL
// analytic functions; db/seed/market_verify.sql compares the two.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.ts';

export type Expected = { symbol: string; date: string; metric: string; value: number | null };

type Bar = { date: string; close: number; adjClose: number; adjHigh: number; adjLow: number };

/** Effective values of parent_net_income and equity from the financial seed (issuer values). */
export function financialInputs(seedPath = join(ROOT, 'db/seed/pilot_seed.sql')) {
  const text = readFileSync(seedPath, 'utf8');
  const out = new Map<string, number>();
  for (const m of text.matchAll(/stage_fact\(b, \d+, '(\w+)', '(\d{4})', '(parent_net_income|equity)', '(-?\d+)'/g)) {
    out.set(`${m[1]}|${m[2]}|${m[3]}`, Number(m[4]));
  }
  return out;
}

/** Report year used on date D under RETRO-APR01: N with D >= 01/04/(N+1). */
export function reportYear(date: string, month = 4, day = 1): number {
  const y = Number(date.slice(0, 4));
  const cutoff = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return date >= cutoff ? y - 1 : y - 2;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const stddevSample = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

export function expectations(
  prices: Record<string, string>[], shares: Record<string, string>[], capital: Record<string, string>[], dates: string[],
): Expected[] {
  const fin = financialInputs();
  const out: Expected[] = [];
  for (const symbol of [...new Set(prices.map((p) => p.symbol))]) {
    const bars: Bar[] = prices.filter((p) => p.symbol === symbol).map((p) => ({
      date: p.trading_date, close: Number(p.close) * 1000, adjClose: Number(p.adj_close) * 1000,
      adjHigh: Number(p.adj_high) * 1000, adjLow: Number(p.adj_low) * 1000,
    }));
    const sh = shares.filter((s) => s.symbol === symbol).sort((a, b) => a.effective_date.localeCompare(b.effective_date));
    for (const date of dates) {
      const i = bars.findIndex((b) => b.date === date);
      if (i < 0) continue;
      const c = bars.map((b) => b.adjClose);
      const avg = (n: number) => (i + 1 >= n ? mean(c.slice(i + 1 - n, i + 1)) : null);
      const ret = (k: number) => (i >= k ? c[i] / c[i - k] - 1 : null);
      const rets = i >= 252 ? Array.from({ length: 252 }, (_, k) => c[i - 251 + k] / c[i - 252 + k] - 1) : null;
      const hl = i + 1 >= 252 ? bars.slice(i - 251, i + 1) : null;
      const push = (metric: string, value: number | null) => out.push({ symbol, date, metric, value });
      push('CLOSE_PRICE', bars[i].close);
      push('RETURN_1M', ret(21));
      push('RETURN_1Y', ret(252));
      push('MA20', avg(20));
      push('MA200', avg(200));
      push('VOLATILITY_1Y', rets && stddevSample(rets) * Math.sqrt(252));
      push('HIGH_52W', hl && Math.max(...hl.map((b) => b.adjHigh)));
      push('LOW_52W', hl && Math.min(...hl.map((b) => b.adjLow)));
      // Valuation
      const s = [...sh].reverse().find((x) => x.effective_date <= date);
      const n = reportYear(date);
      const pni = fin.get(`${symbol}|${n}|parent_net_income`);
      const eq = fin.get(`${symbol}|${n}|equity`);
      const nci = capital.find((x) => x.symbol === symbol && Number(x.fiscal_year) === n && x.item_code === 'non_controlling_interest');
      const shares = s ? Number(s.shares_outstanding) : null;
      const cap = shares !== null ? bars[i].close * shares : null;
      const parentEquity = eq !== undefined && nci ? eq - Number(nci.issuer_value) : null;
      push('MARKET_CAP', cap);
      push('EPS', cap !== null && pni !== undefined && shares ? pni / shares : null);
      push('PE', cap !== null && pni !== undefined && pni > 0 ? cap / pni : null);
      push('BVPS', shares && parentEquity !== null ? parentEquity / shares : null);
      push('PB', cap !== null && parentEquity !== null && parentEquity > 0 ? cap / parentEquity : null);
    }
  }
  return out;
}
