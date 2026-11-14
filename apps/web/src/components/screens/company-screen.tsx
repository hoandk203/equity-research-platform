'use client';
import Link from 'next/link';
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState } from 'react';
import { DEFAULT_YEAR, METRIC_YEARS, SYMBOL_PATTERN, type MarketSnapshot, type ReportLine, type StatementKind } from '@erp/contracts';
import { useCompany, useLineage, useMarketSnapshot, useMetrics, usePrices, useReportLines } from '../../lib/queries';
import { formatDate, formatMetric, formatPercent, formatPrice, formatVolume, shortHash } from '../../lib/format';
import { LINE_STATUS, METRIC_STATUS, STATEMENT, labelOf } from '../../lib/labels';
import { MA_WINDOWS, RANGES, parseRange } from '../../lib/chart';
import { CompareButton } from '../compare-button';
import { PriceChart, type ChartKind } from '../price-chart';
import { ValuationCard } from '../valuation-card';
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
      <ValuationCard symbol={c.symbol} />
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
      {tab === 'gia' ? <PriceTab symbol={c.symbol} /> : null}
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

/** Price tab (P-05): candles or line, volume, moving averages, range; state in ?khoang=&kieu=&gia=. */
function PriceTab({ symbol }: { symbol: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const range = parseRange(params.get('khoang'));
  const kind: ChartKind = params.get('kieu') === 'duong' ? 'line' : 'candle';
  const basis = params.get('gia') === 'goc' ? 'UNADJUSTED' : 'ADJUSTED';
  const [ma, setMa] = useState<number[]>([20, 50]);
  const prices = usePrices(symbol, basis);
  const snap = useMarketSnapshot(symbol);
  const set = (key: string, value: string) => {
    const q = new URLSearchParams(params.toString());
    q.set(key, value);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };
  const showMa = basis === 'ADJUSTED' ? ma : [];

  return (
    <>
      <div className="card">
        <div className="chart-controls">
          <div className="seg" role="group" aria-label="Khoảng thời gian">
            {RANGES.map((r) => (
              <button key={r.id} type="button" className={r.id === range ? 'on' : undefined} aria-pressed={r.id === range} onClick={() => set('khoang', r.id)} title={r.label}>
                {r.id === 'TC' ? 'Tất cả' : r.id}
              </button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Kiểu biểu đồ">
            <button type="button" className={kind === 'candle' ? 'on' : undefined} aria-pressed={kind === 'candle'} onClick={() => set('kieu', 'nen')}>
              Nến
            </button>
            <button type="button" className={kind === 'line' ? 'on' : undefined} aria-pressed={kind === 'line'} onClick={() => set('kieu', 'duong')}>
              Đường
            </button>
          </div>
          <div className="seg" role="group" aria-label="Loại giá">
            <button type="button" className={basis === 'ADJUSTED' ? 'on' : undefined} aria-pressed={basis === 'ADJUSTED'} onClick={() => set('gia', 'dc')} title="Điều chỉnh theo cổ tức, cổ phiếu thưởng">
              Giá điều chỉnh
            </button>
            <button type="button" className={basis === 'UNADJUSTED' ? 'on' : undefined} aria-pressed={basis === 'UNADJUSTED'} onClick={() => set('gia', 'goc')} title="Giá khớp lệnh thực tế từng phiên">
              Giá gốc
            </button>
          </div>
          <div className="ma-toggles" role="group" aria-label="Trung bình động">
            {MA_WINDOWS.map((w) => (
              <label key={w} className={`ma ma-${w}`}>
                <input type="checkbox" checked={ma.includes(w)} disabled={basis !== 'ADJUSTED'} onChange={() => setMa(ma.includes(w) ? ma.filter((x) => x !== w) : [...ma, w].sort((a, b) => a - b))} /> MA{w}
              </label>
            ))}
          </div>
        </div>
        {prices.isLoading ? <Loading text="Đang tải chuỗi giá…" /> : null}
        {prices.error ? <ErrorBox error={prices.error} /> : null}
        {prices.data && prices.data.bars.length === 0 ? <Empty title="Chưa có dữ liệu giá cho mã này" /> : null}
        {prices.data && prices.data.bars.length > 0 ? <PriceChart bars={prices.data.bars} kind={kind} range={range} maWindows={showMa} /> : null}
        <p className="muted small" style={{ marginBottom: 0 }}>
          Đơn vị: đồng/cổ phiếu; khối lượng khớp lệnh. {basis === 'ADJUSTED'
            ? 'Giá điều chỉnh do nguồn công bố tại ngày tải, dùng cho lợi suất và trung bình động.'
            : 'Giá gốc là giá khớp lệnh từng phiên (dùng cho vốn hóa); có bước nhảy ở ngày chia cổ tức, cổ phiếu thưởng nên không hiện trung bình động.'}
        </p>
      </div>
      {snap.data ? <MarketStats snap={snap.data} /> : null}
      {prices.data ? (
        <div className="grid grid-2">
          <div className="card">
            <h3>Nguồn dữ liệu</h3>
            <dl className="kv small">
              <dt>Nguồn chính</dt>
              <dd>{prices.data.source?.code ?? '—'} · đối chiếu với CafeF và SSI</dd>
              <dt>Khoảng có dữ liệu</dt>
              <dd className="num">
                {formatDate(prices.data.firstAvailable)} → {formatDate(prices.data.lastAvailable)} · {prices.data.bars.length} phiên
              </dd>
              <dt>Tệp nguồn</dt>
              <dd className="mono">
                {shortHash(prices.data.source?.sha256)} · đợt nhập #{prices.data.source?.batchId ?? '—'}
              </dd>
            </dl>
          </div>
          <div className="card">
            <h3>Phiên đã hiệu chỉnh ({prices.data.corrections.length})</h3>
            {prices.data.corrections.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Không có: mọi giá của chuỗi này khớp nguồn đối chiếu.
              </p>
            ) : (
              <ul className="small corrections">
                {prices.data.corrections.map((c) => (
                  <li key={`${c.date}-${c.field}`} title={`${c.reason}. ${c.evidence}`}>
                    <strong className="num">{formatDate(c.date)}</strong> {FIELD_NAME[c.field] ?? c.field}: nguồn chính ghi{' '}
                    <span className="num">{formatPrice(c.providerValue)}</span>, dùng <span className="num">{formatPrice(c.acceptedValue)}</span>
                    <div className="muted">
                      {c.basis === 'UNADJUSTED'
                        ? 'Khác CafeF và SSI (sai bước giá hoặc ngoài biên độ ngày); giá trị nhận là giá hai nguồn đối chiếu cùng xác nhận.'
                        : 'Tính lại từ giá gốc đã hiệu chỉnh bằng hệ số điều chỉnh của nguồn chính.'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

const FIELD_NAME: Record<string, string> = { OPEN: 'giá mở cửa', HIGH: 'giá cao nhất', LOW: 'giá thấp nhất', CLOSE: 'giá đóng cửa', VOLUME: 'khối lượng' };

function MarketStats({ snap }: { snap: MarketSnapshot }) {
  const items: Array<[string, string, string?]> = [
    ['Lợi suất 1 tháng', formatPercent(snap.return1m, true)],
    ['Lợi suất 3 tháng', formatPercent(snap.return3m, true)],
    ['Lợi suất 6 tháng', formatPercent(snap.return6m, true)],
    ['Lợi suất 1 năm', formatPercent(snap.return1y, true)],
    ['Biến động 1 năm', formatPercent(snap.volatility1y), 'Độ lệch chuẩn lợi suất ngày × √252'],
    ['MA20 / MA50', `${formatPrice(snap.ma20)} / ${formatPrice(snap.ma50)}`],
    ['MA200', formatPrice(snap.ma200)],
    ['Cao / thấp 52 tuần', `${formatPrice(snap.high52w)} / ${formatPrice(snap.low52w)}`],
    ['Cách đỉnh 52 tuần', formatPercent(snap.dist52wHigh, true)],
    ['Khối lượng phiên', formatVolume(snap.volume)],
  ];
  return (
    <section className="card" aria-label="Chỉ số thị trường">
      <h3>Chỉ số thị trường · phiên {formatDate(snap.tradingDate)}</h3>
      <div className="stats stats-wide">
        {items.map(([label, value, title]) => (
          <div className="stat" key={label} title={title}>
            <span className="stat-label">{label}</span>
            <span className="stat-value num">{value}</span>
          </div>
        ))}
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>
        Tính trong Oracle bằng hàm phân tích trên giá điều chỉnh (lợi suất theo số phiên: 21/63/126/252); giá trị trống khi chưa đủ cửa sổ.
      </p>
    </section>
  );
}
