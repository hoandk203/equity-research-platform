import { movingAverage, parseRange, rangeStart } from '../src/lib/chart';
import { EMPTY, formatDate, formatMarketValue, formatPercent, formatPrice, formatShares, formatTimes, unitLabel } from '../src/lib/format';
import { decodeConditions } from '../src/lib/screening-url';
import { statusLabel } from '../src/lib/labels';

describe('market formatting', () => {
  it('formats prices, percents, multiples and share counts the Vietnamese way', () => {
    expect(formatPrice(95800)).toBe('95.800');
    expect(formatPercent(-0.2506)).toBe('-25,06 %');
    expect(formatPercent(0.0123, true)).toBe('+1,23 %');
    expect(formatTimes(20.7714)).toBe('20,77 lần');
    expect(formatShares('1703507121')).toBe('1.703.507.121');
    expect(formatShares('1703507121', true)).toBe('1.703,5 triệu cp');
    expect(formatDate('2025-12-31')).toBe('31/12/2025');
  });
  it('never turns missing values into zero', () => {
    for (const v of [formatPrice(null), formatPercent(undefined), formatTimes(null), formatShares(null), formatDate(null)]) expect(v).toBe(EMPTY);
    expect(formatMarketValue(null, 'TIMES', 'PE')).toBe(EMPTY);
  });
  it('formats screening values by unit and metric', () => {
    expect(formatMarketValue(163195982191800, 'VND', 'MARKET_CAP')).toBe('163.195,98 tỷ đồng');
    expect(formatMarketValue(95800, 'VND', 'CLOSE_PRICE')).toBe('95.800 đ');
    expect(formatMarketValue(4612.3, 'VND_PER_SHARE', 'EPS')).toBe('4.612 đ/cp');
    expect(formatMarketValue(0.1734, 'PERCENT', 'RETURN_1Y')).toBe('17,34 %');
    expect(unitLabel('VND', 'MARKET_CAP')).toBe('tỷ đồng');
    expect(unitLabel('VND', 'MA200')).toBe('nghìn đồng');
  });
  it('labels market statuses and falls back to financial ones', () => {
    expect(statusLabel('NO_REPORT').text).toBe('Chưa có BCTC');
    expect(statusLabel('INSUFFICIENT_HISTORY').text).toBe('Chưa đủ lịch sử');
    expect(statusLabel('BLOCKED_INPUT_QUALITY').text).toBe('Bị chặn do chất lượng');
  });
  it('accepts market metric codes with digits in shared links', () => {
    expect(decodeConditions('RETURN_1Y~gt~0;MA200~ge~20')).toEqual([
      { metric: 'RETURN_1Y', op: '>', value: 0 },
      { metric: 'MA200', op: '>=', value: 20 },
    ]);
  });
});

describe('chart helpers', () => {
  it('computes moving averages only where the window is full (same rule as the database)', () => {
    const bars = [1, 2, 3, 4, 5].map((c, i) => ({ date: `2025-01-0${i + 1}`, close: c }));
    expect(movingAverage(bars, 3)).toEqual([
      { time: '2025-01-03', value: 2 },
      { time: '2025-01-04', value: 3 },
      { time: '2025-01-05', value: 4 },
    ]);
    expect(movingAverage(bars, 6)).toEqual([]);
  });
  it('turns a range into the first visible date, clamping month ends', () => {
    expect(rangeStart('2025-12-31', '1N')).toBe('2024-12-31');
    expect(rangeStart('2025-03-31', '1T')).toBe('2025-02-28');
    expect(rangeStart('2024-03-31', '1T')).toBe('2024-02-29');
    expect(rangeStart('2025-12-31', 'TC')).toBeNull();
    expect(parseRange('3T')).toBe('3T');
    expect(parseRange('bad')).toBe('1N');
  });
});
