import { toDisplayThreshold, toStoredThreshold } from './screening';
import { SYMBOL_PATTERN, REQUEST_ID_PATTERN, SCREENING_OPERATORS } from './constants';

describe('threshold conversion', () => {
  it('converts percent thresholds to plain ratios exactly', () => {
    expect(toStoredThreshold(10, 'PERCENT')).toBe(0.1);
    expect(toStoredThreshold(15.5, 'PERCENT')).toBe(0.155);
    expect(toStoredThreshold(-3, 'PERCENT')).toBe(-0.03);
  });
  it('keeps TIMES thresholds unchanged', () => {
    expect(toStoredThreshold(1.2, 'TIMES')).toBe(1.2);
  });
  it('round-trips', () => {
    for (const v of [0, 8.66, 10, 60, 100.25]) {
      expect(toDisplayThreshold(toStoredThreshold(v, 'PERCENT'), 'PERCENT')).toBe(v);
    }
  });
});

describe('market thresholds', () => {
  it('reads market cap in billion VND and prices in thousand VND', () => {
    expect(toStoredThreshold(100000, 'VND', 'MARKET_CAP')).toBe(1e14);
    expect(toStoredThreshold(95.8, 'VND', 'CLOSE_PRICE')).toBe(95800);
    expect(toStoredThreshold(4500, 'VND_PER_SHARE', 'EPS')).toBe(4500);
    expect(toStoredThreshold(12, 'TIMES', 'PE')).toBe(12);
  });
  it('round-trips market units', () => {
    expect(toDisplayThreshold(toStoredThreshold(163196.5, 'VND', 'MARKET_CAP'), 'VND', 'MARKET_CAP')).toBe(163196.5);
    expect(toDisplayThreshold(toStoredThreshold(26.4, 'VND', 'MA200'), 'VND', 'MA200')).toBe(26.4);
    expect(toDisplayThreshold(toStoredThreshold(-25.06, 'PERCENT', 'RETURN_1Y'), 'PERCENT', 'RETURN_1Y')).toBe(-25.06);
  });
});

describe('shared limits', () => {
  it('accepts tickers and rejects injection attempts', () => {
    expect(SYMBOL_PATTERN.test('VNM')).toBe(true);
    expect(SYMBOL_PATTERN.test("VNM' OR '1'='1")).toBe(false);
    expect(SYMBOL_PATTERN.test('vnm')).toBe(false);
  });
  it('restricts request ids', () => {
    expect(REQUEST_ID_PATTERN.test('demo-0001')).toBe(true);
    expect(REQUEST_ID_PATTERN.test('a b')).toBe(false);
  });
  it('lists the five operators supported by the database', () => {
    expect(SCREENING_OPERATORS).toEqual(['>=', '>', '<=', '<', '=']);
  });
});
