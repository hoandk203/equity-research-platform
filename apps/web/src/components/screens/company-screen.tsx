'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Fragment, useState } from 'react';
import { DEFAULT_YEAR, METRIC_YEARS, SYMBOL_PATTERN, type ReportLine, type StatementKind } from '@erp/contracts';
import { useCompany, useLineage, useMetrics, useReportLines } from '../../lib/queries';
import { formatMetric, shortHash } from '../../lib/format';
import { LINE_STATUS, METRIC_STATUS, STATEMENT, labelOf } from '../../lib/labels';
import { CompareButton } from '../compare-button';
import { Badge, Empty, ErrorBox, Loading, Money, MoneyUnit, PageTitle } from '../ui';

type Tab = 'bao-cao' | 'chi-so' | 'truy-vet' | 'gia';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'bao-cao', label: 'Báo cáo tài chính' },
  { id: 'chi-so', label: 'Chỉ số' },
  { id: 'truy-vet', label: 'Truy vết chỉ số' },
  { id: 'gia', label: 'Giá' },
];

/** S2 — company detail (FR-02, FR-03, FR-08 view, FR-09 notice). State: ?nam=&tab=&ketqua= */
export function CompanyScreen() {
  const { symbol: rawSymbol } = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(rawSymbol ?? '').toUpperCase();
  const params = useSearchParams();
  const company = useCompany(SYMBOL_PATTERN.test(symbol) ? symbol : '');
  const years = company.data?.reportSets.map((s) => s.fiscalYear) ?? [];
  const requestedYear = Number(params.get('nam'));
  const year = years.includes(requestedYear) ? requestedYear : years.includes(DEFAULT_YEAR) ? DEFAULT_YEAR : (years.at(-1) ?? DEFAULT_YEAR);
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'bao-cao') as Tab;
  const resultParam = Number(params.get('ketqua'));
  const resultId = Number.isInteger(resultParam) && resultParam > 0 ? resultParam : null;
  const href = (p: { nam?: number; tab?: Tab; ketqua?: number | null }) => {
    const q = new URLSearchParams({ nam: String(p.nam ?? year), tab: p.tab ?? tab });
    const r = p.ketqua === undefined ? (p.tab && p.tab !== 'truy-vet' ? null : resultId) : p.ketqua;
    if (r) q.set('ketqua', String(r));
    return `/doanh-nghiep/${symbol}?${q.toString()}`;
  };

  if (!SYMBOL_PATTERN.test(symbol)) return <ErrorBox error={new Error('invalid')} />;
  if (company.isLoading) return <Loading />;
  if (company.error) return <ErrorBox error={company.error} />;
  const c = company.data;
  if (!c) return null;
  const set = c.reportSets.find((s) => s.fiscalYear === year);

  return (
    <>
      <PageTitle
        title={`${c.symbol} · ${c.companyName}`}
        subtitle={`Sàn ${c.exchange} · phạm vi hợp nhất · ${c.reportSets.length} năm có báo cáo`}
        actions={
          <>
            <CompareButton symbol={c.symbol} />
            <Link className="btn btn-secondary" href="/">
              ← Danh sách
            </Link>
          </>
        }
      />
      <div className="card" style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div className="muted small">Năm tài chính</div>
          <nav className="year-picker" aria-label="Chọn năm">
            {years.map((y) => (
              <Link key={y} href={href({ nam: y, ketqua: null })} className={y === year ? 'active' : undefined} scroll={false} aria-current={y === year ? 'true' : undefined}>
                {y}
              </Link>
            ))}
          </nav>
        </div>
        {set ? (
          <dl className="kv small">
            <dt>Phiên bản dữ liệu</dt>
            <dd className="mono">
              {set.datasetVersion} · lựa chọn v{set.selectionVersion}
            </dd>
            <dt>Nghiệm thu</dt>
            <dd>{set.acceptanceStatus === 'VERIFIED' ? 'Đã đối chiếu với báo cáo kiểm toán' : set.acceptanceStatus}</dd>
            <dt>Ngày công bố</dt>
            <dd>{set.publicationStatus === 'UNKNOWN' ? 'Chưa xác minh (dữ liệu dùng cho phân tích hồi cứu)' : 'Đã xác minh'}</dd>
          </dl>
        ) : null}
      </div>
      <nav className="tabs" aria-label="Nội dung">
        {TABS.map((t) => (
          <Link key={t.id} href={href({ tab: t.id })} className={t.id === tab ? 'active' : undefined} scroll={false} aria-current={t.id === tab ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === 'bao-cao' ? <ReportTab symbol={c.symbol} year={year} /> : null}
      {tab === 'chi-so' ? <MetricsTab symbol={c.symbol} year={year} traceHref={(id) => href({ tab: 'truy-vet', ketqua: id })} /> : null}
      {tab === 'truy-vet' ? <LineageTab symbol={c.symbol} year={year} resultId={resultId} pickHref={(id) => href({ tab: 'truy-vet', ketqua: id })} /> : null}
      {tab === 'gia' ? <PriceTab /> : null}
    </>
  );
}

function ReportTab({ symbol, year }: { symbol: string; year: number }) {
  const { data, isLoading, error } = useReportLines(symbol, year);
  const [open, setOpen] = useState<string | null>(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !data.reportSet) return <Empty title={`Không có bộ báo cáo hiện hành cho năm ${year}`} />;
  const groups: StatementKind[] = ['BS', 'IS', 'CF'];
  const src = data.sources.BS ?? data.sources.IS ?? data.sources.CF;
  const corrected = data.lines.filter((l) => l.isCorrected).length;
  return (
    <>
      <div className="grid grid-2">
        <div className="card">
          <h3>Nguồn và đơn vị</h3>
          <dl className="kv small">
            <dt>Nguồn số liệu</dt>
            <dd>CafeF (mã báo cáo nguồn {src?.sourceReportType ?? '—'}; phạm vi hợp nhất đã xác minh)</dd>
            <dt>Đơn vị gốc</dt>
            <dd>
              {src?.originalUnit ?? '—'} · tiền tệ {src?.currency ?? '—'}
            </dd>
            <dt>Niên độ</dt>
            <dd className="num">
              {src?.fiscalStart ?? '—'} → {src?.fiscalEnd ?? '—'}
            </dd>
          </dl>
        </div>
        <div className="card">
          <h3>Hiệu chỉnh trong năm {year}</h3>
          <p className="small" style={{ margin: 0 }}>
            {corrected === 0
              ? 'Không dòng nào cần hiệu chỉnh: mọi số khớp với nguồn sau khi đối chiếu báo cáo kiểm toán.'
              : `${corrected} dòng dùng số đã hiệu chỉnh theo báo cáo kiểm toán; số gốc của nguồn vẫn được lưu nguyên. Bấm “Xem hiệu chỉnh” để thấy lý do và trang PDF.`}
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Chỉ tiêu</th>
              <th className="right">
                Giá trị (<MoneyUnit />)
              </th>
              <th>Trạng thái</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const lines = data.lines.filter((l) => l.statementKind === g);
              if (!lines.length) return null;
              return (
                <Fragment key={g}>
                  <tr className="group">
                    <td colSpan={4}>{STATEMENT[g]}</td>
                  </tr>
                  {lines.map((l) => (
                    <ReportRow key={l.itemCode} line={l} open={open === l.itemCode} onToggle={() => setOpen(open === l.itemCode ? null : l.itemCode)} />
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ReportRow({ line, open, onToggle }: { line: ReportLine; open: boolean; onToggle: () => void }) {
  const missing = line.lineStatus === 'MISSING';
  return (
    <>
      <tr>
        <td>
          {line.lineName}
          <div className="muted small mono">
            {line.itemCode}
            {line.rawCode ? ` · mã nguồn ${line.rawCode}` : ''}
          </div>
        </td>
        <td className="right">{missing ? <span className="muted">Thiếu dữ liệu</span> : <Money vnd={line.effectiveValueVnd} />}</td>
        <td>
          <Badge label={labelOf(LINE_STATUS, line.lineStatus)} />
          {line.openIssueCount > 0 ? <Badge label={{ text: `${line.openIssueCount} vấn đề chất lượng`, tone: 'bad' }} /> : null}
        </td>
        <td>
          {line.isCorrected ? (
            <button type="button" className="btn-link" onClick={onToggle} aria-expanded={open}>
              {open ? 'Ẩn hiệu chỉnh' : 'Xem hiệu chỉnh'}
            </button>
          ) : (
            <span className="muted small">Khớp nguồn</span>
          )}
        </td>
      </tr>
      {open && line.correction ? (
        <tr>
          <td colSpan={4} style={{ background: '#f8f6ef' }}>
            <dl className="kv small">
              <dt>Số gốc của nguồn</dt>
              <dd>
                <Money vnd={line.providerValueVnd} /> <MoneyUnit />
              </dd>
              <dt>Số sau hiệu chỉnh</dt>
              <dd>
                <Money vnd={line.effectiveValueVnd} /> <MoneyUnit />
              </dd>
              <dt>Lý do</dt>
              <dd>{line.correction.reason}</dd>
              <dt>Bằng chứng</dt>
              <dd>
                {line.correction.pdfUrl ? (
                  <a href={line.correction.pdfUrl} target="_blank" rel="noreferrer">
                    Báo cáo kiểm toán (PDF)
                  </a>
                ) : (
                  'PDF kiểm toán'
                )}
                {line.correction.page ? `, trang ${line.correction.page}` : ''} · <span className="mono">{shortHash(line.correction.pdfSha256)}</span>
              </dd>
              <dt>Mã hiệu chỉnh</dt>
              <dd className="mono">
                {line.correction.key} · {line.correction.status}
              </dd>
            </dl>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function MetricsTab({ symbol, year, traceHref }: { symbol: string; year: number; traceHref: (id: number) => string }) {
  const { data, isLoading, error } = useMetrics(symbol, year);
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  if (!data || data.metrics.length === 0) {
    return (
      <Empty title={`Chưa có chỉ số cho năm ${year}`}>
        {(METRIC_YEARS as readonly number[]).includes(year) ? 'Năm này chưa được tính chỉ số.' : 'Năm 2022 là năm cơ sở: chỉ dùng làm số liệu năm trước cho chỉ số 2023.'}
      </Empty>
    );
  }
  return (
    <div className="grid grid-4">
      {data.metrics.map((m) => (
        <article key={m.metricCode} className="metric-card">
          <span className="name">{m.metricName}</span>
          <span className="value num">{formatMetric(m.displayValue, m.displayUnit)}</span>
          <span>
            <Badge label={labelOf(METRIC_STATUS, m.status)} />
          </span>
          <span className="muted small mono">{m.metricCode}</span>
          <Link href={traceHref(m.resultId)} scroll={false} className="small">
            Truy vết số liệu →
          </Link>
        </article>
      ))}
    </div>
  );
}

function LineageTab({ symbol, year, resultId, pickHref }: { symbol: string; year: number; resultId: number | null; pickHref: (id: number) => string }) {
  const metrics = useMetrics(symbol, year);
  const lineage = useLineage(resultId);
  return (
    <>
      <div className="card">
        <h3>Chọn chỉ số để truy vết</h3>
        {metrics.isLoading ? <Loading /> : null}
        {metrics.data && metrics.data.metrics.length === 0 ? <p className="muted">Năm {year} không có chỉ số.</p> : null}
        <div className="chip-list">
          {metrics.data?.metrics.map((m) => (
            <Link key={m.resultId} href={pickHref(m.resultId)} scroll={false} className={m.resultId === resultId ? 'chip on' : 'chip'} style={{ textDecoration: 'none' }}>
              {m.metricName}
            </Link>
          ))}
        </div>
      </div>
      {resultId === null ? <p className="muted">Chọn một chỉ số ở trên để xem nó được tính từ những số liệu nào.</p> : null}
      {lineage.isLoading ? <Loading /> : null}
      {lineage.error ? <ErrorBox error={lineage.error} /> : null}
      {lineage.data ? (
        <section className="card" aria-labelledby="lineage-title">
          <h2 id="lineage-title">
            {lineage.data.formula.metricName} · {lineage.data.result.symbol} {lineage.data.result.fiscalYear}
          </h2>
          <dl className="kv">
            <dt>Công thức</dt>
            <dd>
              <span className="formula">{lineage.data.formula.formulaText}</span> <span className="muted small">(phiên bản {lineage.data.formula.formulaVersion})</span>
            </dd>
            <dt>Kết quả</dt>
            <dd>
              <strong className="num">{formatMetric(lineage.data.result.value === null ? null : Math.round(lineage.data.result.value * (lineage.data.formula.displayUnit === 'PERCENT' ? 10000 : 100)) / 100, lineage.data.formula.displayUnit)}</strong>{' '}
              <Badge label={labelOf(METRIC_STATUS, lineage.data.result.currentStatus ?? lineage.data.result.storedStatus)} />
              {lineage.data.result.currentStatus === null ? <span className="muted small"> (không còn là kết quả hiện hành)</span> : null}
            </dd>
            <dt>Lượt tính</dt>
            <dd className="mono">
              run #{lineage.data.result.runId} · kết quả #{lineage.data.result.resultId}
            </dd>
          </dl>
          <div className="table-wrap" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Năm</th>
                  <th>Chỉ tiêu đầu vào</th>
                  <th className="right">
                    Giá trị dùng (<MoneyUnit />)
                  </th>
                  <th>Hiệu chỉnh</th>
                  <th>Bằng chứng</th>
                </tr>
              </thead>
              <tbody>
                {lineage.data.inputs.map((i) => (
                  <tr key={i.position}>
                    <td className="num">{i.position}</td>
                    <td className="num">
                      {i.inputYear} <span className="muted small">({i.yearOffset === 0 ? 't' : 't−1'})</span>
                    </td>
                    <td>
                      {i.lineName ?? i.itemCode}
                      <div className="muted small mono">{i.itemCode}</div>
                    </td>
                    <td className="right">
                      <Money vnd={i.effectiveValueVnd} />
                      {i.correctionKey ? (
                        <div className="muted small">
                          gốc: <Money vnd={i.providerValueVnd} />
                        </div>
                      ) : null}
                    </td>
                    <td>{i.correctionKey ? <Badge label={{ text: 'Đã hiệu chỉnh', tone: 'warn', hint: i.correctionKey }} /> : <span className="muted small">Không</span>}</td>
                    <td className="small">
                      {i.issuerPdfUrl ? (
                        <a href={i.issuerPdfUrl} target="_blank" rel="noreferrer">
                          PDF kiểm toán
                        </a>
                      ) : (
                        'PDF kiểm toán'
                      )}
                      {i.issuerPdfPage ? `, trang ${i.issuerPdfPage}` : ''}
                      <div className="muted mono">{shortHash(i.issuerPdfSha256)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Mỗi đầu vào trỏ tới đúng số liệu trong bộ báo cáo đã khóa của năm tương ứng; cập nhật dữ liệu sau này không làm đổi kết quả đã tính.
          </p>
        </section>
      ) : null}
    </>
  );
}

function PriceTab() {
  return (
    <div className="notice notice-warn">
      <strong>Chưa có dữ liệu giá đã nghiệm thu.</strong>
      <p className="small" style={{ marginBottom: 0 }}>
        Giá và khối lượng giao dịch ngày thuộc phạm vi mở rộng. Ứng dụng không hiển thị dữ liệu giá mẫu hay giả lập để tránh nhầm với giá thực.
      </p>
    </div>
  );
}
