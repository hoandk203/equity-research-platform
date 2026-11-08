import { EMPTY, formatMetric, formatMoney, formatTyDong, formatVnd } from '../src/lib/format';

describe('money formatting', () => {
  it('shows billions of VND with Vietnamese separators, exactly', () => {
    expect(formatTyDong('53312370717301')).toBe('53.312,37');
    expect(formatTyDong('8668141000000')).toBe('8.668,14');
    expect(formatTyDong('5000000')).toBe('0,01');
    expect(formatTyDong('-34483015286107')).toBe('-34.483,02');
  });
  it('never turns missing values into zero', () => {
    expect(formatTyDong(null)).toBe(EMPTY);
    expect(formatTyDong('')).toBe(EMPTY);
    expect(formatTyDong('abc')).toBe(EMPTY);
    expect(formatVnd(undefined)).toBe(EMPTY);
  });
  it('can show full VND without float rounding', () => {
    expect(formatVnd('53312370717301')).toBe('53.312.370.717.301');
    expect(formatMoney('9007199254740993', 'VND')).toBe('9.007.199.254.740.993');
  });
});

describe('metric formatting', () => {
  it('uses the display value from Oracle and the right unit', () => {
    expect(formatMetric(15.3, 'PERCENT')).toBe('15,30 %');
    expect(formatMetric(2.03, 'TIMES')).toBe('2,03 lần');
    expect(formatMetric(-3.2, 'PERCENT')).toBe('-3,20 %');
  });
  it('renders null as a dash', () => {
    expect(formatMetric(null, 'PERCENT')).toBe(EMPTY);
  });
});
