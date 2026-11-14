'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAppDispatch, useAppSelector } from '../store/store';
import { preferences } from '../store/slices';

const NAV = [
  { href: '/', label: 'Doanh nghiệp', match: (p: string) => p === '/' || p.startsWith('/doanh-nghiep') },
  { href: '/sang-loc', label: 'Sàng lọc', match: (p: string) => p.startsWith('/sang-loc') },
  { href: '/so-sanh', label: 'So sánh', match: (p: string) => p.startsWith('/so-sanh') },
  { href: '/dot-nhap', label: 'Đợt nhập', match: (p: string) => p.startsWith('/dot-nhap') },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const basket = useAppSelector((s) => s.compareBasket.symbols);
  const moneyMode = useAppSelector((s) => s.preferences.moneyMode);
  const dispatch = useAppDispatch();
  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden />
          Equity Research Platform
        </Link>
        <nav aria-label="Điều hướng chính">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={n.match(pathname) ? 'active' : undefined} aria-current={n.match(pathname) ? 'page' : undefined}>
              {n.label}
              {n.href === '/so-sanh' && basket.length ? <span className="count">{basket.length}</span> : null}
            </Link>
          ))}
        </nav>
        <label className="money-toggle">
          Số tiền
          <select value={moneyMode} onChange={(e) => dispatch(preferences.actions.setMoneyMode(e.target.value as 'TY' | 'VND'))}>
            <option value="TY">tỷ đồng</option>
            <option value="VND">VND đầy đủ</option>
          </select>
        </label>
      </header>
      <main className="content">{children}</main>
      <footer className="footer">
        Phân tích hồi cứu trên dữ liệu đã đối chiếu với báo cáo kiểm toán · ngày công bố báo cáo chưa xác minh · giá ngày 2022–2025 từ VNDirect, đối chiếu CafeF và SSI ·
        dữ liệu đọc từ Oracle AI Database 26ai bằng tài khoản chỉ đọc
      </footer>
    </div>
  );
}
