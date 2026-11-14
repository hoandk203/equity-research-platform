'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo } from 'react';
import { DATE_PATTERN, DEFAULT_YEAR, MAX_COMPARE_SYMBOLS, METRIC_YEARS, MIN_COMPARE_SYMBOLS, REPORT_YEARS, SYMBOL_PATTERN } from '@erp/contracts';
import { useCompanies, useCompare } from '../../lib/queries';
import { formatDate, formatMarketValue, formatMetric } from '../../lib/format';
import { METRIC_GROUP, METRIC_STATUS, labelOf, statusLabel } from '../../lib/labels';
import { useAppDispatch, useAppSelector } from '../../store/store';
import { compareBasket } from '../../store/slices';
import { Badge, Empty, ErrorBox, Loading, PageTitle } from '../ui';

/** S4 — side-by-side comparison (FR-05): one year and one formula for all; no per-company fallback. */
export function CompareScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const basket = useAppSelector((s) => s.compareBasket.symbols);
  const companies = useCompanies('');

  const maParam = params.get('ma');
  const fromUrl = useMemo(
    () => [...new Set((maParam ?? '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL_PATTERN.test(s)))].slice(0, MAX_COMPARE_SYMBOLS),
    [maParam],
  );
  // Without ?ma= the page compares the basket filled from the list/detail pages.
  const selected = maParam !== null ? fromUrl : basket.slice(0, MAX_COMPARE_SYMBOLS);
  const yearParam = Number(params.get('nam'));
  const year = (REPORT_YEARS as readonly number[]).includes(yearParam) ? yearParam : DEFAULT_YEAR;
  const dateParam = params.get('ngay');
  const date = dateParam && DATE_PATTERN.test(dateParam) ? dateParam : null;

  const go = (symbols: string[], y = year, d = date) => {
    const q = new URLSearchParams({ nam: String(y), ma: symbols.join(',') });
    if (d) q.set('ngay', d);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  // Keep the basket in sync with an explicit selection in the URL.
  useEffect(() => {
    if (maParam !== null) dispatch(compareBasket.actions.set(fromUrl));
  }, [maParam, fromUrl, dispatch]);

  const toggle = (s: string) => {
    if (selected.includes(s)) go(selected.filter((x) => x !== s));
    else if (selected.length < MAX_COMPARE_SYMBOLS) go([...selected, s]);
  };

  const result = useCompare(selected, year, date);
  const tooFew = selected.length < MIN_COMPARE_SYMBOLS;

  return (
    <>
      <PageTitle title="So sánh doanh nghiệp" subtitle={`Chọn ${MIN_COMPARE_SYMBOLS}–${MAX_COMPARE_SYMBOLS} mã, cùng một năm và cùng phiên bản công thức. Ô thiếu hiện “Chưa xác định”, không lấy số của năm khác.`} />
      <div className="card">
        <div className="muted small">Doanh nghiệp ({selected.length}/{MAX_COMPARE_SYMBOLS})</div>
        {companies.isLoading ? <Loading /> : null}
        {companies.error ? <ErrorBox error={companies.error} /> : null}
        <div className="chip-list" role="group" aria-label="Chọn doanh nghiệp">
          {companies.data?.map((c) => {
            const on = selected.includes(c.symbol);
            const disabled = !on && selected.length >= MAX_COMPARE_SYMBOLS;
            return (
              <button key={c.symbol} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} disabled={disabled} onClick={() => toggle(c.symbol)} title={c.companyName}>
                {c.symbol}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: '0.9rem' }}>
          <div className="muted small">Năm tài chính</div>
          <div className="year-picker">
            {REPORT_YEARS.map((y) => (
              <a
                key={y}
                href={`?nam=${y}${selected.length ? `&ma=${selected.join(',')}` : ''}`}
                className={y === year ? 'active' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(selected, y);
                }}
              >
                {y}
              </a>
            ))}
          </div>
          {!(METRIC_YEARS as readonly number[]).includes(year) ? <p className="muted small">Năm {year} là năm cơ sở nên không có chỉ số; mọi ô sẽ là Chưa xác định.</p> : null}
        </div>
        <div style={{ marginTop: '0.9rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="compare-date" className="muted small">
            Ngày định giá
          </label>
          <input id="compare-date" type="date" value={date ?? result.data?.date ?? ''} onChange={(e) => go(selected, year, e.target.value || null)} />
          <span className="muted small">Mặc định phiên gần nhất; mỗi mã dùng phiên gần nhất trước hoặc bằng ngày chọn.</span>
        </div>
      </div>

      {tooFew ? <Empty title={`Chọn thêm ${MIN_COMPARE_SYMBOLS - selected.length} mã để so sánh`}>Có thể bấm “+ So sánh” ở trang danh sách hoặc trang chi tiết.</Empty> : null}
      {!tooFew && result.isLoading ? <Loading /> : null}
      {result.error ? <ErrorBox error={result.error} /> : null}
      {result.data ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Chỉ số ({result.data.year})</th>
                {result.data.symbols.map((s) => (
                  <th key={s} className="right">
                    <Link href={`/doanh-nghiep/${s}?nam=${result.data.year}&tab=chi-so`}>{s}</Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data.rows.map((row) => (
                <tr key={row.metricCode}>
                  <td>
                    {row.metricName}
                    <div className="muted small mono">{row.metricCode}</div>
                  </td>
                  {row.cells.map((cell) => (
                    <td key={cell.symbol} className="right">
                      {cell.compareStatus === 'VALUE' ? (
                        <span className="num">{formatMetric(cell.displayValue, row.displayUnit)}</span>
                      ) : (
                        <>
                          <Badge label={{ text: 'Chưa xác định', tone: 'warn' }} />
                          <div className="muted small">{labelOf(METRIC_STATUS, cell.status).text}</div>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {result.data && result.data.marketRows.length ? (
        <section aria-labelledby="compare-market-title" style={{ marginTop: '1.25rem' }}>
          <h2 id="compare-market-title">Định giá và thị trường · {formatDate(result.data.date)}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Chỉ số</th>
                  {result.data.symbols.map((s) => (
                    <th key={s} className="right">
                      <Link href={`/doanh-nghiep/${s}?tab=gia`}>{s}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['VALUATION', 'MARKET'] as const).map((g) => (
                  <Fragment key={g}>
                    <tr className="group">
                      <td colSpan={result.data.symbols.length + 1}>{METRIC_GROUP[g]}</td>
                    </tr>
                    {result.data.marketRows
                      .filter((r) => r.metricGroup === g)
                      .map((row) => (
                        <tr key={row.metricCode}>
                          <td>
                            {row.metricName}
                            <div className="muted small mono">{row.metricCode}</div>
                          </td>
                          {row.cells.map((cell) => (
                            <td key={cell.symbol} className="right">
                              {cell.status === 'VALID' ? (
                                <span className="num">{formatMarketValue(cell.value, row.displayUnit, row.metricCode)}</span>
                              ) : (
                                <>
                                  <Badge label={{ text: 'Chưa xác định', tone: 'warn' }} />
                                  <div className="muted small">{statusLabel(cell.status).text}</div>
                                </>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">P/E, P/B dùng BCTC theo chính sách hồi cứu (BCTC năm N áp dụng từ 01/04 năm N+1); vốn hóa = giá gốc × số cổ phiếu lưu hành tại ngày.</p>
        </section>
      ) : null}
    </>
  );
}
