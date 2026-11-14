// Pure normalisation and reconciliation rules (unit-tested in market.spec.ts).
import { TOLERANCE } from './config.ts';

/** One VNDirect session. Prices stay in the provider unit (thousand VND) as decimal strings. */
export type PriceRow = {
  symbol: string;
  trading_date: string; // YYYY-MM-DD
  open: string; high: string; low: string; close: string;
  adj_open: string; adj_high: string; adj_low: string; adj_close: string;
  volume: string; // order-matching shares, integer
};

export type CafefRow = { symbol: string; trading_date: string; open: number; high: number; low: number; close: number; adj_close: number; volume: number };

export type ShareRow = { symbol: string; effective_date: string; shares_outstanding: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^\d{1,9}(\.\d{1,6})?$/;
const INTEGER = /^\d{1,19}$/;

/** Format a JSON number without exponent so Oracle can parse it with a fixed mask. */
export function decimalText(n: unknown, what: string): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new Error(`${what}: not a non-negative number (${String(n)})`);
  const s = Number.isInteger(n) ? n.toFixed(0) : String(Number(n.toFixed(6)));
  if (/e/i.test(s)) throw new Error(`${what}: exponent notation (${s})`);
  return s;
}

export function isWeekend(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

/** OHLC must be internally consistent: low <= open, close <= high. */
export function ohlcProblem(o: number, h: number, l: number, c: number): string | null {
  if (!(l <= h)) return 'low > high';
  if (!(o >= l && o <= h)) return 'open outside [low, high]';
  if (!(c >= l && c <= h)) return 'close outside [low, high]';
  return null;
}

export function normaliseVndPrices(symbol: string, payload: { data: Record<string, unknown>[] }, from: string, to: string): PriceRow[] {
  const seen = new Set<string>();
  const rows = payload.data.map((r) => {
    const where = `${symbol} ${String(r.date)}`;
    if (r.code !== symbol) throw new Error(`${where}: code ${String(r.code)}`);
    if (r.type !== 'STOCK' || r.floor !== 'HOSE') throw new Error(`${where}: not a HOSE stock row`);
    const date = String(r.date);
    if (!DATE.test(date) || date < from || date > to) throw new Error(`${where}: date outside ${from}..${to}`);
    if (isWeekend(date)) throw new Error(`${where}: weekend session`);
    if (seen.has(date)) throw new Error(`${where}: duplicate session`);
    seen.add(date);
    const row: PriceRow = {
      symbol, trading_date: date,
      open: decimalText(r.open, `${where} open`), high: decimalText(r.high, `${where} high`),
      low: decimalText(r.low, `${where} low`), close: decimalText(r.close, `${where} close`),
      adj_open: decimalText(r.adOpen, `${where} adOpen`), adj_high: decimalText(r.adHigh, `${where} adHigh`),
      adj_low: decimalText(r.adLow, `${where} adLow`), adj_close: decimalText(r.adClose, `${where} adClose`),
      volume: decimalText(r.nmVolume, `${where} nmVolume`),
    };
    if (!INTEGER.test(row.volume)) throw new Error(`${where}: fractional volume`);
    for (const k of ['open', 'high', 'low', 'close', 'adj_open', 'adj_high', 'adj_low', 'adj_close'] as const) {
      if (!DECIMAL.test(row[k])) throw new Error(`${where}: ${k} format ${row[k]}`);
    }
    // OHLC consistency is checked after reconciliation (assertOhlc): a provider error such
    // as a close outside [low, high] must be corrected with evidence, not silently dropped.
    return row;
  });
  return rows.sort((a, b) => a.trading_date.localeCompare(b.trading_date));
}

export function assertOhlc(rows: PriceRow[]): void {
  for (const r of rows) {
    const p1 = ohlcProblem(+r.open, +r.high, +r.low, +r.close);
    if (p1) throw new Error(`${r.symbol} ${r.trading_date}: unadjusted ${p1}`);
    const p2 = ohlcProblem(+r.adj_open, +r.adj_high, +r.adj_low, +r.adj_close);
    if (p2) throw new Error(`${r.symbol} ${r.trading_date}: adjusted ${p2}`);
  }
}

/** HOSE tick size (thousand VND) for equities: < 10 -> 0.01, 10..49.95 -> 0.05, >= 50 -> 0.1. */
export function isValidHoseTick(price: number): boolean {
  const tick = price < 10 ? 0.01 : price < 50 ? 0.05 : 0.1;
  const steps = price / tick;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

export function normaliseCafef(symbol: string, pages: { Data: { Data: Record<string, unknown>[] } }[]): CafefRow[] {
  const out = new Map<string, CafefRow>();
  for (const page of pages) {
    for (const r of page.Data.Data) {
      if (r.Symbol !== symbol) throw new Error(`CafeF ${symbol}: symbol ${String(r.Symbol)}`);
      const [d, m, y] = String(r.Ngay).split('/');
      const date = `${y}-${m}-${d}`;
      if (!DATE.test(date)) throw new Error(`CafeF ${symbol}: date ${String(r.Ngay)}`);
      if (out.has(date)) throw new Error(`CafeF ${symbol} ${date}: duplicate`);
      out.set(date, {
        symbol, trading_date: date, open: Number(r.GiaMoCua), high: Number(r.GiaCaoNhat), low: Number(r.GiaThapNhat),
        close: Number(r.GiaDongCua), adj_close: Number(r.GiaDieuChinh), volume: Number(r.KhoiLuongKhopLenh),
      });
    }
  }
  return [...out.values()].sort((a, b) => a.trading_date.localeCompare(b.trading_date));
}

export type PriceReconciliation = {
  symbol: string;
  primary_sessions: number;
  second_sessions: number;
  only_primary: string[];
  only_second: string[];
  compared: number;
  raw_mismatches: { date: string; field: string; primary: number; second: number }[];
  volume_mismatches: { date: string; primary: number; second: number }[];
  adjusted_max_relative_diff: number;
  adjusted_over_tolerance: { date: string; primary: number; second: number; relative: number }[];
};

export function reconcilePrices(symbol: string, primary: PriceRow[], second: CafefRow[]): PriceReconciliation {
  const p = new Map(primary.map((r) => [r.trading_date, r]));
  const s = new Map(second.map((r) => [r.trading_date, r]));
  const res: PriceReconciliation = {
    symbol, primary_sessions: p.size, second_sessions: s.size,
    only_primary: [...p.keys()].filter((d) => !s.has(d)), only_second: [...s.keys()].filter((d) => !p.has(d)),
    compared: 0, raw_mismatches: [], volume_mismatches: [], adjusted_max_relative_diff: 0, adjusted_over_tolerance: [],
  };
  for (const [date, a] of p) {
    const b = s.get(date);
    if (!b) continue;
    res.compared++;
    for (const [field, x, y] of [['open', +a.open, b.open], ['high', +a.high, b.high], ['low', +a.low, b.low], ['close', +a.close, b.close]] as const) {
      if (Math.abs(x - y) > TOLERANCE.rawPrice) res.raw_mismatches.push({ date, field, primary: x, second: y });
    }
    if (Math.abs(+a.volume - b.volume) > TOLERANCE.volume) res.volume_mismatches.push({ date, primary: +a.volume, second: b.volume });
    const rel = Math.abs(+a.adj_close - b.adj_close) / +a.adj_close;
    res.adjusted_max_relative_diff = Math.max(res.adjusted_max_relative_diff, rel);
    if (rel > TOLERANCE.adjustedRelative) res.adjusted_over_tolerance.push({ date, primary: +a.adj_close, second: b.adj_close, relative: rel });
  }
  return res;
}

export function normaliseVndShares(symbol: string, payload: { data: Record<string, unknown>[] }, from: string, to: string): ShareRow[] {
  const seen = new Set<string>();
  return payload.data
    .filter((r) => String(r.reportDate) >= from && String(r.reportDate) <= to)
    .map((r) => {
      const date = String(r.reportDate);
      if (r.code !== undefined && r.code !== symbol) throw new Error(`${symbol} shares: code ${String(r.code)}`);
      if (!DATE.test(date) || seen.has(date)) throw new Error(`${symbol} shares: bad/duplicate date ${date}`);
      seen.add(date);
      const shares = decimalText(r.value, `${symbol} shares ${date}`);
      if (!INTEGER.test(shares) || shares === '0') throw new Error(`${symbol} shares ${date}: not a positive integer`);
      return { symbol, effective_date: date, shares_outstanding: shares };
    })
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
}

/** Shares implied by the balance sheet: common share capital / par value, only when there are no treasury shares. */
export function sharesFromBalanceSheet(shareCapital: bigint, treasuryCost: bigint, par = 10_000n): bigint | null {
  if (treasuryCost !== 0n) return null; // 415 is a cost, not a share count: cannot convert
  if (shareCapital <= 0n || shareCapital % par !== 0n) return null;
  return shareCapital / par;
}

/** CafeF balance-sheet mapping for the three capital items (see capital_review.json). */
export function capitalFromCafef(values: Record<string, number | null | undefined>): Record<'share_capital' | 'treasury_shares' | 'non_controlling_interest', bigint> {
  const big = (v: number | null | undefined) => BigInt(Math.round(Number(v ?? 0)));
  const a = big(values['411a']);
  const b = big(values['411b']);
  const t = big(values['415']); // shown negative (in brackets) on the balance sheet
  return {
    share_capital: a > 0n ? a : b === 0n ? big(values['411']) : 0n,
    treasury_shares: t < 0n ? -t : t,
    non_controlling_interest: big(values['429']),
  };
}

export type SsiRow = { trading_date: string; adj_close: number; volume: number };

/** SSI chart history: parallel arrays, epoch seconds at 00:00 UTC of the session date. */
export function normaliseSsi(payload: { data: { t: number[]; c: number[]; v: number[] } }): SsiRow[] {
  const { t, c, v } = payload.data;
  if (t.length !== c.length || t.length !== v.length) throw new Error('SSI: array lengths differ');
  return t.map((ts, i) => ({ trading_date: new Date(ts * 1000).toISOString().slice(0, 10), adj_close: c[i], volume: v[i] }));
}

/**
 * A session present only in the primary source is accepted when the third source has the
 * same session with the same order-matching volume and an adjusted close within tolerance.
 */
export function confirmSessions(dates: string[], primary: PriceRow[], third: SsiRow[]): { confirmed: string[]; unconfirmed: string[] } {
  const p = new Map(primary.map((r) => [r.trading_date, r]));
  const t = new Map(third.map((r) => [r.trading_date, r]));
  const confirmed: string[] = [];
  const unconfirmed: string[] = [];
  for (const d of dates) {
    const a = p.get(d);
    const b = t.get(d);
    const ok = a && b && Math.abs(+a.volume - b.volume) <= TOLERANCE.volume
      && Math.abs(+a.adj_close - b.adj_close) / +a.adj_close <= TOLERANCE.adjustedRelative;
    (ok ? confirmed : unconfirmed).push(d);
  }
  return { confirmed, unconfirmed };
}

export type SsiBar = { trading_date: string; o: number; h: number; l: number; c: number; v: number };

export function normaliseSsiBars(payload: { data: { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] } }): SsiBar[] {
  const { t, o, h, l, c, v } = payload.data;
  return t.map((ts, i) => ({ trading_date: new Date(ts * 1000).toISOString().slice(0, 10), o: o[i], h: h[i], l: l[i], c: c[i], v: v[i] }));
}

export type PriceCorrection = {
  symbol: string; trading_date: string; field: string; provider_value: string; accepted_value: string;
  evidence: string; reason: string;
};
export type Divergence = { symbol: string; trading_date: string; field: string; primary: number; second: number; implied: number | null; decision: string };

/** Relative agreement needed between a candidate and the SSI-implied unadjusted value. */
const IMPLIED_TOLERANCE = 0.0006;
const RAW_FIELDS = ['open', 'high', 'low', 'close'] as const;
const SSI_FIELD = { open: 'o', high: 'h', low: 'l', close: 'c' } as const;

/**
 * Adjudicate every disagreement between VNDirect (primary) and CafeF (second) with SSI (third).
 * SSI publishes only adjusted prices, so they are rescaled to unadjusted with the factor
 * observed on the fields where VNDirect and CafeF already agree on that session. The candidate
 * that matches the implied value (and is a valid HOSE tick) wins; the other source is noted.
 * Volume: the value equal to SSI's order-matching volume wins.
 * Returns corrected rows, the corrections to record, and the divergences kept as notes.
 */
export function adjudicate(primary: PriceRow[], second: CafefRow[], third: SsiBar[]): {
  rows: PriceRow[]; corrections: PriceCorrection[]; divergences: Divergence[]; unresolved: Divergence[];
} {
  const sMap = new Map(second.map((r) => [r.trading_date, r]));
  const tMap = new Map(third.map((r) => [r.trading_date, r]));
  const corrections: PriceCorrection[] = [];
  const divergences: Divergence[] = [];
  const unresolved: Divergence[] = [];
  const rows = primary.map((orig) => {
    const b = sMap.get(orig.trading_date);
    if (!b) return orig;
    const row = { ...orig };
    const t = tMap.get(row.trading_date);
    const differs = RAW_FIELDS.filter((f) => Math.abs(+row[f] - b[f]) > TOLERANCE.rawPrice);
    const agreed = RAW_FIELDS.filter((f) => !differs.includes(f));
    const factorSsi = t && agreed.length ? agreed.reduce((acc, f) => acc + +row[f] / t[SSI_FIELD[f]], 0) / agreed.length : null;
    const factorVnd = agreed.length ? +row[agreed[0]] / +row[`adj_${agreed[0]}`] : null;
    for (const f of differs) {
      const implied = t && factorSsi ? t[SSI_FIELD[f]] * factorSsi : null;
      const d: Divergence = { symbol: row.symbol, trading_date: row.trading_date, field: f, primary: +row[f], second: b[f], implied, decision: 'UNRESOLVED' };
      if (implied !== null) {
        const ep = Math.abs(+row[f] - implied) / implied;
        const es = Math.abs(b[f] - implied) / implied;
        if (ep <= IMPLIED_TOLERANCE && ep < es && isValidHoseTick(+row[f])) d.decision = 'KEEP_PRIMARY';
        else if (es <= IMPLIED_TOLERANCE && es < ep && isValidHoseTick(b[f]) && factorVnd) {
          d.decision = 'USE_SECOND';
          const adjField = `adj_${f}` as const;
          const newAdj = String(Number((b[f] / factorVnd).toFixed(3)));
          const evidence = `CafeF ${f}=${b[f]}; SSI adjusted ${f}=${t?.[SSI_FIELD[f]]} rescaled x${factorSsi?.toFixed(5)} = ${implied.toFixed(3)}`;
          corrections.push({ symbol: row.symbol, trading_date: row.trading_date, field: f, provider_value: row[f], accepted_value: String(b[f]), evidence,
            reason: `VNDirect ${f} ${row[f]} disagrees with CafeF and SSI${isValidHoseTick(+row[f]) ? '' : ' and is not a valid HOSE tick'}` });
          corrections.push({ symbol: row.symbol, trading_date: row.trading_date, field: adjField, provider_value: row[adjField], accepted_value: newAdj, evidence,
            reason: `Recomputed from the corrected unadjusted ${f} with VNDirect's adjustment factor ${factorVnd.toFixed(5)}` });
          row[f] = String(b[f]);
          row[adjField] = newAdj;
        }
      }
      (d.decision === 'UNRESOLVED' ? unresolved : divergences).push(d);
    }
    if (+row.volume !== b.volume) {
      const d: Divergence = { symbol: row.symbol, trading_date: row.trading_date, field: 'volume', primary: +row.volume, second: b.volume, implied: t?.v ?? null, decision: 'UNRESOLVED' };
      if (t && t.v === +row.volume) d.decision = 'KEEP_PRIMARY';
      else if (t && t.v === b.volume) {
        d.decision = 'USE_SECOND';
        corrections.push({ symbol: row.symbol, trading_date: row.trading_date, field: 'volume', provider_value: row.volume, accepted_value: String(b.volume),
          evidence: `CafeF and SSI volume ${b.volume}`, reason: 'VNDirect order-matching volume disagrees with CafeF and SSI' });
        row.volume = String(b.volume);
      }
      (d.decision === 'UNRESOLVED' ? unresolved : divergences).push(d);
    }
    return row;
  });
  return { rows, corrections, divergences, unresolved };
}
