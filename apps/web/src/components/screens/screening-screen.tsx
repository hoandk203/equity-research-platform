'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { DATE_PATTERN, toStoredThreshold, type ScreeningCondition, type ScreeningOutcome } from '@erp/contracts';
import { useCatalog, useMarketCatalog, useMarketSnapshot, useScreening, type ScreeningMode } from '../../lib/queries';
import { ApiError } from '../../lib/api';
import { decodeConditions, encodeConditions } from '../../lib/screening-url';
import { formatDate, formatMarketValue, unitLabel } from '../../lib/format';
import { METRIC_GROUP, OPERATOR, OUTCOME, statusLabel } from '../../lib/labels';
import type { ScreeningFormValues, ScreeningMetric } from '../../lib/screening-form';
import { useAppDispatch, useAppSelector } from '../../store/store';
import { screeningDraft } from '../../store/slices';
import { ScreeningForm } from '../screening-form';
import { Badge, Empty, ErrorBox, Loading, PageTitle } from '../ui';

const ORDER: ScreeningOutcome[] = ['PASS', 'UNKNOWN', 'FAIL'];

/**
 * S3 — screening (FR-04, P-07). The executed query lives in the URL: ?nam=&dk= (financial
 * metrics of a fiscal year) or ?ngay=&dk= (financial + valuation + market at a date).
 * The unsent draft lives in Redux.
 */
export function ScreeningScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const draft = useAppSelector((s) => s.screeningDraft);
  const financial = useCatalog();
  const market = useMarketCatalog();
  // Latest session of any company: default date and upper bound of the date input.
  const latest = useMarketSnapshot('FPT');
  const lastDate = latest.data?.tradingDate ?? null;

  const metrics: ScreeningMetric[] = useMemo(
    () => [
      ...(financial.data ?? []).filter((m) => m.formulaVersion === '1.0.0')
        .map((m) => ({ metricCode: m.metricCode, metricName: m.metricName, displayUnit: m.displayUnit, group: 'FINANCIAL' as const })),
      ...(market.data ?? []).map((m) => ({ metricCode: m.metricCode, metricName: m.metricName, displayUnit: m.displayUnit, group: m.metricGroup })),
    ],
    [financial.data, market.data],
  );

  const urlYear = Number(params.get('nam'));
  const urlDate = params.get('ngay');
  const dk = params.get('dk');
  const active = useMemo(() => {
    const conditions = decodeConditions(dk);
    if (!conditions) return null;
    if (urlDate && DATE_PATTERN.test(urlDate)) return { mode: 'date' as const, date: urlDate, year: draft.year, conditions };
    return Number.isInteger(urlYear) && urlYear > 0 ? { mode: 'year' as const, year: urlYear, date: '', conditions } : null;
  }, [dk, urlYear, urlDate, draft.year]);

  const stored: ScreeningCondition[] | null = useMemo(() => {
    if (!active || !metrics.length) return null;
    return active.conditions.map((c) => {
      const unit = metrics.find((m) => m.metricCode === c.metric)?.displayUnit ?? 'TIMES';
      return { metric: c.metric, op: c.op, value: toStoredThreshold(c.value, unit, c.metric) };
    });
  }, [active, metrics]);

  const mode: ScreeningMode | null = active ? (active.mode === 'date' ? { date: active.date } : { year: active.year }) : null;
  const result = useScreening(mode, stored);
  const formDefaults: ScreeningFormValues = active ?? { ...draft, date: draft.date || lastDate || '' };
  const serverError = result.error instanceof ApiError && result.error.status === 400 ? result.error.message : null;

  const run = (values: ScreeningFormValues) => {
    dispatch(screeningDraft.actions.save(values));
    const where = values.mode === 'date' ? `ngay=${values.date}` : `nam=${values.year}`;
    router.push(`${pathname}?${where}&dk=${encodeURIComponent(encodeConditions(values.conditions))}`, { scroll: false });
  };

  const loading = financial.isLoading || market.isLoading;
  const data = result.data;
  const title = data
    ? data.date
      ? `Kết quả ngày ${formatDate(data.date)} (BCTC năm ${data.year ?? '—'})`
      : `Kết quả năm ${data.year}`
    : '';

  return (
    <>
      <PageTitle
        title="Sàng lọc doanh nghiệp"
        subtitle="Oracle đánh giá từng điều kiện: chỉ giá trị Hợp lệ mới được tính Đạt/Không đạt; thiếu dữ liệu, chưa đủ lịch sử hoặc chưa nghiệm thu là Chưa xác định."
      />
      {loading ? <Loading text="Đang tải danh mục chỉ số…" /> : null}
      {financial.error ? <ErrorBox error={financial.error} /> : null}
      {market.error ? <ErrorBox error={market.error} /> : null}
      {metrics.length && !loading ? (
        <ScreeningForm
          key={`${active?.mode ?? draft.mode}|${active?.year ?? draft.year}|${active?.date ?? ''}|${dk ?? ''}|${lastDate ?? ''}`}
          catalog={metrics}
          defaultValues={formDefaults}
          onSubmit={run}
          serverError={serverError}
          lastDate={lastDate}
        />
      ) : null}

      {!active ? (
        <p className="muted">
          Nhập điều kiện rồi bấm “Sàng lọc”. Ví dụ theo năm: năm 2024, biên lợi nhuận ròng ≥ 10% và khả năng thanh toán hiện hành ≥ 1 lần. Ví dụ theo ngày: ROE ≥ 15%, P/E ≤ 15 lần và
          lợi suất 1 năm &gt; 0%.
        </p>
      ) : null}
      {active && result.isLoading ? <Loading text="Oracle đang đánh giá điều kiện…" /> : null}
      {result.error && !serverError ? <ErrorBox error={result.error} /> : null}
      {data ? (
        <section aria-labelledby="result-title">
          <h2 id="result-title">
            {title} · {data.rows.filter((r) => r.overallStatus === 'PASS').length}/{data.rows.length} doanh nghiệp đạt
          </h2>
          {ORDER.map((outcome) => {
            const rows = data.rows.filter((r) => r.overallStatus === outcome);
            return (
              <div key={outcome} className="outcome-group">
                <h3>
                  <Badge label={OUTCOME[outcome]} /> {rows.length} doanh nghiệp
                </h3>
                {rows.length === 0 ? (
                  <p className="muted small">Không có.</p>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Doanh nghiệp</th>
                          {data.conditions.map((c, i) => {
                            const m = metrics.find((x) => x.metricCode === c.metric);
                            const shown = active?.conditions[i]?.value;
                            return (
                              <th key={i}>
                                {data.date && m ? <div className="group-tag">{METRIC_GROUP[m.group]}</div> : null}
                                {m?.metricName ?? c.metric} {OPERATOR[c.op]} {shown ?? c.value} {unitLabel(m?.displayUnit, c.metric)}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.symbol}>
                            <td>
                              <Link href={`/doanh-nghiep/${r.symbol}?nam=${r.reportYear ?? data.year}&tab=${data.date ? 'gia' : 'chi-so'}`}>
                                <strong>{r.symbol}</strong>
                              </Link>
                              <div className="muted small">{r.companyName}</div>
                              {r.tradingDate ? <div className="muted small">phiên {formatDate(r.tradingDate)}</div> : null}
                            </td>
                            {r.conditions.map((c, i) => (
                              <td key={i}>
                                <div className="num">{formatMarketValue(c.value, c.unit, c.metric)}</div>
                                <Badge label={OUTCOME[c.conditionStatus]} />{' '}
                                {c.conditionStatus === 'UNKNOWN' ? <span className="muted small">{statusLabel(c.metricStatus).text}</span> : null}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {data.rows.length === 0 ? <Empty title="Không có doanh nghiệp nào" /> : null}
        </section>
      ) : null}
    </>
  );
}
