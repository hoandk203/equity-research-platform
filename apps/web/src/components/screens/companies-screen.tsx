'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SEARCH_MAX_LENGTH } from '@erp/contracts';
import { useCompanies } from '../../lib/queries';
import { CompareButton } from '../compare-button';
import { Empty, ErrorBox, Loading, PageTitle } from '../ui';

/** S1 — company list with accent-insensitive search (FR-01). The query lives in ?q=. */
export function CompaniesScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlQ = params.get('q') ?? '';
  const [text, setText] = useState(urlQ);

  // Debounce typing into the URL so reload/share reproduces the same list.
  useEffect(() => {
    const t = setTimeout(() => {
      if (text.trim() !== urlQ) router.replace(text.trim() ? `${pathname}?q=${encodeURIComponent(text.trim())}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [text, urlQ, router, pathname]);

  const { data, isLoading, error } = useCompanies(urlQ);

  return (
    <>
      <PageTitle title="Doanh nghiệp" subtitle="Tìm theo mã chứng khoán hoặc tên; gõ có dấu hay không dấu đều được." />
      <div className="card">
        <label htmlFor="company-search" className="muted small">
          Tìm doanh nghiệp
        </label>
        <div>
          <input
            id="company-search"
            className="search"
            type="search"
            placeholder="Ví dụ: fpt, hoa phat, sữa"
            maxLength={SEARCH_MAX_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      </div>
      {isLoading ? <Loading /> : null}
      {error ? <ErrorBox error={error} /> : null}
      {data && data.length === 0 ? (
        <Empty title="Không tìm thấy doanh nghiệp phù hợp">Thử tìm theo mã (ví dụ VNM) hoặc một phần tên công ty.</Empty>
      ) : null}
      {data && data.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Tên doanh nghiệp</th>
                <th>Sàn</th>
                <th>Năm có báo cáo</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.symbol}>
                  <td>
                    <Link href={`/doanh-nghiep/${c.symbol}`}>
                      <strong>{c.symbol}</strong>
                    </Link>
                  </td>
                  <td>
                    <Link href={`/doanh-nghiep/${c.symbol}`}>{c.companyName}</Link>
                  </td>
                  <td>{c.exchange}</td>
                  <td className="num">{c.years.length ? c.years.join(', ') : '—'}</td>
                  <td className="right">
                    <CompareButton symbol={c.symbol} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
