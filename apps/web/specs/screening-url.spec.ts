import { decodeConditions, encodeConditions } from '../src/lib/screening-url';
import { toStoredThreshold } from '@erp/contracts';

describe('screening URL codec', () => {
  const conds = [
    { metric: 'NET_MARGIN', op: '>=' as const, value: 10 },
    { metric: 'CURRENT_RATIO', op: '<' as const, value: 1.5 },
  ];
  it('round-trips conditions', () => {
    const text = encodeConditions(conds);
    expect(text).toBe('NET_MARGIN~ge~10;CURRENT_RATIO~lt~1.5');
    expect(decodeConditions(text)).toEqual(conds);
  });
  it('ignores malformed or malicious links instead of trusting them', () => {
    expect(decodeConditions('')).toBeNull();
    expect(decodeConditions('ROE~like~1')).toBeNull();
    expect(decodeConditions("ROE' OR 1=1~ge~1")).toBeNull();
    expect(decodeConditions('ROE~ge~abc')).toBeNull();
    expect(decodeConditions(Array(11).fill('ROE~ge~1').join(';'))).toBeNull();
  });
  it('sends plain ratios to the API (10% -> 0.1)', () => {
    expect(toStoredThreshold(10, 'PERCENT')).toBe(0.1);
    expect(toStoredThreshold(1.5, 'TIMES')).toBe(1.5);
  });
});
