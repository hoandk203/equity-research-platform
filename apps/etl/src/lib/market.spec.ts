import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { parseCsv, toCsv } from './files.ts';
import {
  adjudicate, assertOhlc, capitalFromCafef, confirmSessions, decimalText, isValidHoseTick, normaliseVndPrices,
  normaliseVndShares, ohlcProblem, sharesFromBalanceSheet, type CafefRow, type PriceRow, type SsiBar,
} from './market.ts';

const vnd = (date: string, o: number, h: number, l: number, c: number, f = 2, vol = 1000) => ({
  code: 'FPT', type: 'STOCK', floor: 'HOSE', date, open: o, high: h, low: l, close: c,
  adOpen: o / f, adHigh: h / f, adLow: l / f, adClose: c / f, nmVolume: vol,
});
const row = (date: string, o: number, h: number, l: number, c: number, f = 2, vol = 1000): PriceRow =>
  normaliseVndPrices('FPT', { data: [vnd(date, o, h, l, c, f, vol)] }, '2022-01-01', '2025-12-31')[0];
const cafef = (date: string, o: number, h: number, l: number, c: number, vol = 1000): CafefRow =>
  ({ symbol: 'FPT', trading_date: date, open: o, high: h, low: l, close: c, adj_close: c / 2, volume: vol });
const ssi = (date: string, o: number, h: number, l: number, c: number, vol = 1000, f = 2): SsiBar =>
  ({ trading_date: date, o: o / f, h: h / f, l: l / f, c: c / f, v: vol });

describe('number formatting', () => {
  it('never emits exponent notation and rejects negatives', () => {
    assert.equal(decimalText(1.885727648e9, 'x'), '1885727648');
    assert.equal(decimalText(86.80400000001, 'x'), '86.804');
    assert.throws(() => decimalText(-1, 'x'));
    assert.throws(() => decimalText('5', 'x'));
  });
});

describe('VNDirect normalisation', () => {
  it('sorts sessions and rejects duplicates, weekends and out-of-range dates', () => {
    const rows = normaliseVndPrices('FPT', { data: [vnd('2025-01-03', 10, 11, 9, 10), vnd('2025-01-02', 10, 11, 9, 10)] }, '2025-01-01', '2025-12-31');
    assert.deepEqual(rows.map((r) => r.trading_date), ['2025-01-02', '2025-01-03']);
    assert.throws(() => normaliseVndPrices('FPT', { data: [vnd('2025-01-02', 10, 11, 9, 10), vnd('2025-01-02', 10, 11, 9, 10)] }, '2025-01-01', '2025-12-31'), /duplicate/);
    assert.throws(() => normaliseVndPrices('FPT', { data: [vnd('2025-01-04', 10, 11, 9, 10)] }, '2025-01-01', '2025-12-31'), /weekend/);
    assert.throws(() => normaliseVndPrices('FPT', { data: [vnd('2021-12-31', 10, 11, 9, 10)] }, '2022-01-01', '2025-12-31'), /outside/);
    assert.throws(() => normaliseVndPrices('HPG', { data: [vnd('2025-01-02', 10, 11, 9, 10)] }, '2025-01-01', '2025-12-31'), /code/);
  });
  it('checks OHLC after reconciliation', () => {
    assert.equal(ohlcProblem(10, 11, 9, 10), null);
    assert.match(String(ohlcProblem(10, 11, 9, 8)), /close/);
    assert.throws(() => assertOhlc([row('2025-05-13', 58.9, 59, 58.3, 56.5)]), /close outside/);
  });
  it('keeps share counts in range only', () => {
    const rows = normaliseVndShares('FPT', { data: [
      { code: 'FPT', reportDate: '2026-03-31', value: 2 }, { code: 'FPT', reportDate: '2023-12-31', value: 1269968875 }] }, '2022-12-31', '2025-12-31');
    assert.deepEqual(rows, [{ symbol: 'FPT', effective_date: '2023-12-31', shares_outstanding: '1269968875' }]);
  });
});

describe('HOSE tick size', () => {
  it('accepts valid ticks and rejects invalid ones', () => {
    assert.ok(isValidHoseTick(126));
    assert.ok(isValidHoseTick(63.6));
    assert.ok(isValidHoseTick(26.85));
    assert.ok(!isValidHoseTick(126.03));
    assert.ok(!isValidHoseTick(63.65));
    assert.ok(!isValidHoseTick(26.83));
  });
});

describe('adjudication with the third source', () => {
  it('corrects the primary when CafeF and SSI agree (and recomputes the adjusted twin)', () => {
    const r = adjudicate([row('2025-07-18', 125, 127, 124, 126.03)], [cafef('2025-07-18', 125, 127, 124, 126)], [ssi('2025-07-18', 125, 127, 124, 126)]);
    assert.equal(r.unresolved.length, 0);
    assert.equal(r.rows[0].close, '126');
    assert.equal(r.rows[0].adj_close, '63');
    assert.deepEqual(r.corrections.map((c) => c.field), ['close', 'adj_close']);
  });
  it('keeps the primary when SSI confirms it (CafeF partial session)', () => {
    const r = adjudicate([row('2024-03-06', 108, 110, 108.4, 109.1, 2, 3702600)], [cafef('2024-03-06', 108, 110, 108.7, 109, 2491100)],
      [ssi('2024-03-06', 108, 110, 108.4, 109.1, 3702600)]);
    assert.equal(r.corrections.length, 0);
    assert.deepEqual(r.divergences.map((d) => `${d.field}:${d.decision}`), ['low:KEEP_PRIMARY', 'close:KEEP_PRIMARY', 'volume:KEEP_PRIMARY']);
  });
  it('leaves a disagreement unresolved without third-source evidence', () => {
    const r = adjudicate([row('2025-01-02', 10, 11, 9, 10)], [cafef('2025-01-02', 10, 11, 9, 10.5)], []);
    assert.equal(r.unresolved.length, 1);
    assert.equal(r.rows[0].close, '10');
  });
  it('confirms sessions missing from the second source only with matching SSI volume', () => {
    const p = [row('2025-02-03', 10, 11, 9, 10, 2, 500)];
    assert.deepEqual(confirmSessions(['2025-02-03'], p, [{ trading_date: '2025-02-03', adj_close: 5, volume: 500 }]).confirmed, ['2025-02-03']);
    assert.deepEqual(confirmSessions(['2025-02-03'], p, [{ trading_date: '2025-02-03', adj_close: 5, volume: 499 }]).unconfirmed, ['2025-02-03']);
  });
});

describe('capital items', () => {
  it('uses 411a, falls back to 411 when not split, and reads 415 as a positive cost', () => {
    assert.deepEqual(capitalFromCafef({ '411': 5, '411a': 5, '411b': 0, '415': -3, '429': 7 }), { share_capital: 5n, treasury_shares: 3n, non_controlling_interest: 7n });
    assert.equal(capitalFromCafef({ '411': 20899554450000, '411a': 0, '411b': 0 }).share_capital, 20899554450000n);
    assert.equal(capitalFromCafef({ '411': 9, '411a': 0, '411b': 4 }).share_capital, 0n);
  });
  it('derives shares only without treasury shares and with whole par value', () => {
    assert.equal(sharesFromBalanceSheet(17035071210000n, 0n), 1703507121n);
    assert.equal(sharesFromBalanceSheet(17035071210000n, 5n), null);
    assert.equal(sharesFromBalanceSheet(12345n, 0n), null);
  });
});

describe('CSV', () => {
  it('round-trips quotes, commas and empty cells', () => {
    const text = toCsv(['a', 'b', 'c'], [['x,y', 'say "hi"', null], ['1', '', '3']]);
    assert.deepEqual(parseCsv(text), [{ a: 'x,y', b: 'say "hi"', c: '' }, { a: '1', b: '', c: '3' }]);
  });
});
