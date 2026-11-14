'use client';
import type { ValuationStatus } from '@erp/contracts';
import { useMarketSnapshot, useValuation } from '../lib/queries';
import { EMPTY, formatDate, formatPercent, formatPrice, formatShares, formatTimes } from '../lib/format';
import { VALUATION_STATUS } from '../lib/labels';
import { Badge, ErrorBox, Money, MoneyUnit } from './ui';

function Stat({ label, value, status, title }: { label: string; value: string; status?: ValuationStatus; title?: string }) {
  const bad = status && status !== 'VALID';
  return (
    <div className="stat" title={title}>
      <span className="stat-label">{label}</span>
      <span className="stat-value num">{bad ? EMPTY : value}</span>
      {bad ? <Badge label={VALUATION_STATUS[status]} /> : null}
    </div>
  );
}

/**
 * Valuation summary at the top of the company page (P-06): last close, daily change, market
 * cap, P/E, P/B, EPS, BVPS on the latest session, with the report year and the retrospective
 * label (publication dates of the reports are not verified).
 */
export function ValuationCard({ symbol }: { symbol: string }) {
  const v = useValuation(symbol);
  const m = useMarketSnapshot(symbol);
  if (v.error) return <ErrorBox error={v.error} />;
  const val = v.data;
  const snap = m.data;
  if (!val || !snap) return <div className="card valuation-card muted small">Đang tải định giá…</div>;
  if (!val.tradingDate) return <div className="card valuation-card muted small">Chưa có dữ liệu giá cho mã này.</div>;
  const change = snap.change1d;
  return (
    <section className="card valuation-card" aria-label="Định giá">
      <div className="quote">
        <span className="muted small">Giá đóng cửa {formatDate(val.tradingDate)}</span>
        <span className="quote-price num">{formatPrice(val.close)}</span>
        <span className={`num ${change == null ? 'muted' : change >= 0 ? 'up' : 'down'}`}>{formatPercent(change, true)}</span>
      </div>
      <div className="stats">
        <div className="stat">
          <span className="stat-label">
            Vốn hóa (<MoneyUnit />)
          </span>
          <span className="stat-value">
            <Money vnd={val.marketCap} />
          </span>
        </div>
        <Stat label="P/E" value={formatTimes(val.pe)} status={val.peStatus} />
        <Stat label="P/B" value={formatTimes(val.pb)} status={val.pbStatus} />
        <Stat label="EPS (đồng)" value={formatPrice(val.eps)} status={val.peStatus === 'NEGATIVE_EARNINGS' ? 'VALID' : val.peStatus} />
        <Stat label="BVPS (đồng)" value={formatPrice(val.bvps)} status={val.pbStatus === 'NEGATIVE_BOOK' ? 'VALID' : val.pbStatus} />
      </div>
      <p className="muted small valuation-note">
        <Badge label={{ text: 'Hồi cứu', tone: 'warn', hint: 'Ngày công bố BCTC chưa xác minh' }} /> Dùng BCTC năm {val.reportYear ?? EMPTY} (chính sách{' '}
        <span className="mono">{val.policyCode}</span>: BCTC năm N áp dụng từ 01/04 năm N+1). LNST và vốn chủ thuộc cổ đông công ty mẹ. Số cổ phiếu{' '}
        {formatShares(val.sharesOutstanding)} theo số cuối quý hiệu lực từ {formatDate(val.sharesEffectiveDate)}
        {val.sharesCheck === 'MATCHED_BS' ? ' (khớp vốn cổ phần ÷ mệnh giá)' : ''}.
      </p>
    </section>
  );
}
