import { searchKey } from './vietnamese';

describe('searchKey', () => {
  it('ignores Vietnamese accents, đ and case', () => {
    expect(searchKey('Công ty Cổ phần Tập đoàn Hòa Phát')).toContain('hoa phat');
    expect(searchKey('Sữa Việt Nam')).toBe('sua viet nam');
    expect(searchKey('ĐẦU TƯ')).toBe('dau tu');
  });
  it('collapses whitespace', () => {
    expect(searchKey('  hoa   phat ')).toBe('hoa phat');
  });
});
