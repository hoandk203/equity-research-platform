-- Read model for prices, market metrics and valuation (docs/18 sections 2-3). After 021.
-- Price-derived metrics are materialized (refreshed by pkg_market_import after each price
-- import); valuation stays a live view because it also depends on the current financial
-- report sets, which change independently of prices.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

-- Internal pivot of the current price series: one row per security x session, in VND.
CREATE OR REPLACE VIEW v_price_current AS
SELECT p.security_id, p.trading_date, MAX(p.batch_id) batch_id,
  MAX(CASE WHEN p.price_basis = 'UNADJUSTED' THEN p.open_price * p.price_multiplier END) open_vnd,
  MAX(CASE WHEN p.price_basis = 'UNADJUSTED' THEN p.high_price * p.price_multiplier END) high_vnd,
  MAX(CASE WHEN p.price_basis = 'UNADJUSTED' THEN p.low_price * p.price_multiplier END) low_vnd,
  MAX(CASE WHEN p.price_basis = 'UNADJUSTED' THEN p.close_price * p.price_multiplier END) close_vnd,
  MAX(CASE WHEN p.price_basis = 'ADJUSTED' THEN p.open_price * p.price_multiplier END) adj_open,
  MAX(CASE WHEN p.price_basis = 'ADJUSTED' THEN p.high_price * p.price_multiplier END) adj_high,
  MAX(CASE WHEN p.price_basis = 'ADJUSTED' THEN p.low_price * p.price_multiplier END) adj_low,
  MAX(CASE WHEN p.price_basis = 'ADJUSTED' THEN p.close_price * p.price_multiplier END) adj_close,
  MAX(p.volume) volume, MAX(p.is_corrected) is_corrected
FROM daily_prices p
JOIN market_heads h ON h.security_id = p.security_id AND h.data_kind = 'PRICES' AND h.batch_id = p.batch_id
GROUP BY p.security_id, p.trading_date
WITH READ ONLY;

-- Analytic metrics per session. Windows count sessions (ROWS), and a value is NULL until the
-- window is full, so a partial history never looks like a full-year figure.
BEGIN
  EXECUTE IMMEDIATE 'DROP MATERIALIZED VIEW mv_market_daily';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -12003 THEN RAISE; END IF;
END;
/
CREATE MATERIALIZED VIEW mv_market_daily
  BUILD IMMEDIATE REFRESH COMPLETE ON DEMAND AS
SELECT a.*,
  CASE WHEN COUNT(a.ret_1d) OVER (PARTITION BY a.security_id ORDER BY a.trading_date ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) = 252
       THEN STDDEV_SAMP(a.ret_1d) OVER (PARTITION BY a.security_id ORDER BY a.trading_date ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) * SQRT(252)
  END volatility_1y,
  CASE WHEN a.high_52w IS NOT NULL THEN a.adj_close / a.high_52w - 1 END dist_52w_high
FROM (
  SELECT c.security_id, c.trading_date, c.batch_id, c.open_vnd, c.high_vnd, c.low_vnd, c.close_vnd,
    c.adj_open, c.adj_high, c.adj_low, c.adj_close, c.volume, c.is_corrected,
    ROW_NUMBER() OVER (PARTITION BY c.security_id ORDER BY c.trading_date) session_no,
    LAG(c.close_vnd) OVER (PARTITION BY c.security_id ORDER BY c.trading_date) prev_close_vnd,
    c.adj_close / LAG(c.adj_close, 1) OVER (PARTITION BY c.security_id ORDER BY c.trading_date) - 1 ret_1d,
    c.adj_close / LAG(c.adj_close, 21) OVER (PARTITION BY c.security_id ORDER BY c.trading_date) - 1 ret_1m,
    c.adj_close / LAG(c.adj_close, 63) OVER (PARTITION BY c.security_id ORDER BY c.trading_date) - 1 ret_3m,
    c.adj_close / LAG(c.adj_close, 126) OVER (PARTITION BY c.security_id ORDER BY c.trading_date) - 1 ret_6m,
    c.adj_close / LAG(c.adj_close, 252) OVER (PARTITION BY c.security_id ORDER BY c.trading_date) - 1 ret_1y,
    CASE WHEN COUNT(*) OVER (PARTITION BY c.security_id ORDER BY c.trading_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) = 20
         THEN AVG(c.adj_close) OVER (PARTITION BY c.security_id ORDER BY c.trading_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) END ma20,
    CASE WHEN COUNT(*) OVER (PARTITION BY c.security_id ORDER BY c.trading_date ROWS BETWEEN 49 PRECEDING AND CURRENT ROW) = 50
         THEN AVG(c.adj_close) OVER (PARTITION BY c.security_id ORDER BY c.trading_date ROWS BETWEEN 49 PRECEDING AND CURRENT ROW) END ma50,
    CASE WHEN COUNT(*) OVER (PARTITION BY c.security_id ORDER BY c.trading_date ROWS BETWEEN 199 PRECEDING AND CURRENT ROW) = 200
         THEN AVG(c.adj_close) OVER (PARTITION BY c.security_id ORDER BY c.trading_date ROWS BETWEEN 199 PRECEDING AND CURRENT ROW) END ma200,
    CASE WHEN COUNT(*) OVER (PARTITION BY c.security_id ORDER BY c.trading_date ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) = 252
         THEN MAX(c.adj_high) OVER (PARTITION BY c.security_id ORDER BY c.trading_date ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) END high_52w,
    CASE WHEN COUNT(*) OVER (PARTITION BY c.security_id ORDER BY c.trading_date ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) = 252
         THEN MIN(c.adj_low) OVER (PARTITION BY c.security_id ORDER BY c.trading_date ROWS BETWEEN 251 PRECEDING AND CURRENT ROW) END low_52w
  FROM v_price_current c
) a;
CREATE UNIQUE INDEX mv_market_daily_u1 ON mv_market_daily (security_id, trading_date);
CREATE INDEX mv_market_daily_ix2 ON mv_market_daily (trading_date);

BEGIN
  EXECUTE IMMEDIATE 'DROP MATERIALIZED VIEW mv_price_monthly';
EXCEPTION WHEN OTHERS THEN IF SQLCODE <> -12003 THEN RAISE; END IF;
END;
/
-- Monthly bars for long ranges (both bases) with month-over-month adjusted return.
CREATE MATERIALIZED VIEW mv_price_monthly
  BUILD IMMEDIATE REFRESH COMPLETE ON DEMAND AS
SELECT m.*, m.adj_close / LAG(m.adj_close) OVER (PARTITION BY m.security_id ORDER BY m.month_start) - 1 ret_month
FROM (
  SELECT c.security_id, TRUNC(c.trading_date, 'MM') month_start,
    MIN(c.trading_date) first_session, MAX(c.trading_date) last_session, COUNT(*) sessions,
    MAX(c.open_vnd) KEEP (DENSE_RANK FIRST ORDER BY c.trading_date) open_vnd, MAX(c.high_vnd) high_vnd, MIN(c.low_vnd) low_vnd,
    MAX(c.close_vnd) KEEP (DENSE_RANK LAST ORDER BY c.trading_date) close_vnd,
    MAX(c.adj_open) KEEP (DENSE_RANK FIRST ORDER BY c.trading_date) adj_open, MAX(c.adj_high) adj_high, MIN(c.adj_low) adj_low,
    MAX(c.adj_close) KEEP (DENSE_RANK LAST ORDER BY c.trading_date) adj_close,
    SUM(c.volume) volume
  FROM v_price_current c
  GROUP BY c.security_id, TRUNC(c.trading_date, 'MM')
) m;
CREATE UNIQUE INDEX mv_price_monthly_u1 ON mv_price_monthly (security_id, month_start);

-- ---------------------------------------------------------------------------------------
-- Application-facing views (READ granted in 010).

CREATE OR REPLACE VIEW v_price_history AS
SELECT d.company_id, d.symbol, p.trading_date, p.price_basis,
  p.open_price * p.price_multiplier open_vnd, p.high_price * p.price_multiplier high_vnd,
  p.low_price * p.price_multiplier low_vnd, p.close_price * p.price_multiplier close_vnd,
  p.volume, p.is_corrected, p.batch_id, ds.source_code, a.sha256 source_sha256, a.source_url
FROM daily_prices p
JOIN market_heads h ON h.security_id = p.security_id AND h.data_kind = 'PRICES' AND h.batch_id = p.batch_id
JOIN v_company_directory d ON d.security_id = p.security_id
JOIN source_artifacts a ON a.artifact_id = p.artifact_id
JOIN data_sources ds ON ds.source_id = a.source_id
WITH READ ONLY;

CREATE OR REPLACE VIEW v_price_corrections AS
SELECT d.company_id, d.symbol, p.trading_date, p.price_basis, c.field_name,
  CASE WHEN c.field_name = 'VOLUME' THEN c.provider_value ELSE c.provider_value * p.price_multiplier END provider_value,
  CASE WHEN c.field_name = 'VOLUME' THEN c.accepted_value ELSE c.accepted_value * p.price_multiplier END accepted_value,
  c.reason, c.evidence
FROM price_corrections c
JOIN daily_prices p ON p.price_id = c.price_id
JOIN market_heads h ON h.security_id = p.security_id AND h.data_kind = 'PRICES' AND h.batch_id = p.batch_id
JOIN v_company_directory d ON d.security_id = p.security_id
WITH READ ONLY;

CREATE OR REPLACE VIEW v_market_metrics_daily AS
SELECT d.company_id, d.symbol, m.trading_date, m.session_no, m.batch_id,
  m.open_vnd, m.high_vnd, m.low_vnd, m.close_vnd, m.prev_close_vnd, m.volume, m.is_corrected,
  m.adj_open, m.adj_high, m.adj_low, m.adj_close,
  m.ret_1d, m.ret_1m, m.ret_3m, m.ret_6m, m.ret_1y, m.volatility_1y,
  m.ma20, m.ma50, m.ma200, m.high_52w, m.low_52w, m.dist_52w_high
FROM mv_market_daily m
JOIN v_company_directory d ON d.security_id = m.security_id
WITH READ ONLY;

CREATE OR REPLACE VIEW v_price_monthly AS
SELECT d.company_id, d.symbol, m.month_start, m.first_session, m.last_session, m.sessions,
  m.open_vnd, m.high_vnd, m.low_vnd, m.close_vnd, m.adj_open, m.adj_high, m.adj_low, m.adj_close, m.volume, m.ret_month
FROM mv_price_monthly m
JOIN v_company_directory d ON d.security_id = m.security_id
WITH READ ONLY;

CREATE OR REPLACE VIEW v_share_counts AS
SELECT d.company_id, d.symbol, s.effective_date,
  LEAD(s.effective_date) OVER (PARTITION BY s.security_id ORDER BY s.effective_date) - 1 valid_to,
  s.shares_outstanding, s.reconciliation_status, s.batch_id, ds.source_code, a.sha256 source_sha256, a.source_url
FROM share_counts s
JOIN market_heads h ON h.security_id = s.security_id AND h.data_kind = 'SHARES' AND h.batch_id = s.batch_id
JOIN v_company_directory d ON d.security_id = s.security_id
JOIN source_artifacts a ON a.artifact_id = s.artifact_id
JOIN data_sources ds ON ds.source_id = a.source_id
WITH READ ONLY;

CREATE OR REPLACE VIEW v_capital_facts AS
SELECT d.company_id, d.symbol, f.fiscal_year, f.item_code, f.provider_value_vnd, f.value_vnd,
  CASE WHEN f.correction_reason IS NULL THEN 0 ELSE 1 END is_corrected, f.correction_reason,
  f.evidence_page, pdf.sha256 evidence_sha256, pdf.source_url evidence_url, pa.sha256 provider_sha256, f.raw_locator,
  f.reviewed_by, f.reviewed_at
FROM capital_facts f
JOIN v_company_directory d ON d.company_id = f.company_id
JOIN source_artifacts pdf ON pdf.artifact_id = f.evidence_artifact_id
JOIN source_artifacts pa ON pa.artifact_id = f.provider_artifact_id
WITH READ ONLY;

-- Annual valuation inputs: current report set lines (no recalculation) + capital facts.
CREATE OR REPLACE VIEW v_valuation_inputs AS
WITH fin AS (
  SELECT l.company_id, l.symbol, l.fiscal_year, MAX(l.report_set_id) report_set_id,
    MAX(CASE WHEN l.item_code = 'parent_net_income' THEN l.effective_value_vnd END) parent_net_income,
    MAX(CASE WHEN l.item_code = 'parent_net_income' THEN l.line_status END) parent_net_income_status,
    MAX(CASE WHEN l.item_code = 'equity' THEN l.effective_value_vnd END) equity,
    MAX(CASE WHEN l.item_code = 'equity' THEN l.line_status END) equity_status,
    SUM(CASE WHEN l.item_code IN ('parent_net_income', 'equity') THEN l.open_issue_count ELSE 0 END) open_issues
  FROM v_report_lines l
  WHERE l.scope_code = 'CONSOLIDATED' AND l.item_code IN ('parent_net_income', 'equity')
  GROUP BY l.company_id, l.symbol, l.fiscal_year
), cap AS (
  SELECT company_id, fiscal_year,
    MAX(CASE WHEN item_code = 'share_capital' THEN value_vnd END) share_capital,
    MAX(CASE WHEN item_code = 'treasury_shares' THEN value_vnd END) treasury_shares,
    MAX(CASE WHEN item_code = 'non_controlling_interest' THEN value_vnd END) non_controlling_interest,
    MAX(CASE WHEN item_code = 'non_controlling_interest' THEN evidence_page END) nci_evidence_page,
    MAX(CASE WHEN item_code = 'non_controlling_interest' AND correction_reason IS NOT NULL THEN 1 ELSE 0 END) nci_corrected
  FROM capital_facts GROUP BY company_id, fiscal_year
)
SELECT fin.company_id, fin.symbol, fin.fiscal_year, fin.report_set_id,
  fin.parent_net_income, fin.equity, cap.non_controlling_interest,
  fin.equity - cap.non_controlling_interest parent_equity, cap.share_capital, cap.treasury_shares,
  cap.nci_evidence_page, cap.nci_corrected,
  CASE WHEN fin.parent_net_income_status = 'VERIFIED' AND fin.equity_status = 'VERIFIED' AND fin.open_issues = 0
            AND cap.non_controlling_interest IS NOT NULL THEN 'VERIFIED'
       WHEN cap.non_controlling_interest IS NULL THEN 'MISSING_INPUT'
       ELSE 'INPUT_NOT_VERIFIED' END input_status
FROM fin LEFT JOIN cap ON cap.company_id = fin.company_id AND cap.fiscal_year = fin.fiscal_year
WITH READ ONLY;

-- Daily valuation under the active retrospective policy (docs/17 Q3/Q4).
CREATE OR REPLACE VIEW v_valuation_daily AS
WITH pol AS (
  SELECT policy_code, available_month, available_day FROM valuation_policies WHERE is_active = 1
), base AS (
  SELECT d.company_id, d.symbol, m.security_id, m.trading_date, m.close_vnd, pol.policy_code,
    EXTRACT(YEAR FROM m.trading_date)
      - CASE WHEN m.trading_date >= ADD_MONTHS(TRUNC(m.trading_date, 'YYYY'), pol.available_month - 1) + pol.available_day - 1
             THEN 1 ELSE 2 END report_year
  FROM mv_market_daily m
  JOIN v_company_directory d ON d.security_id = m.security_id
  CROSS JOIN pol
), joined AS (
  SELECT b.*, sh.shares_outstanding, sh.effective_date shares_effective_date, sh.reconciliation_status shares_check,
    vi.parent_net_income, vi.equity, vi.non_controlling_interest, vi.parent_equity, vi.input_status
  FROM base b
  OUTER APPLY (
    SELECT s.shares_outstanding, s.effective_date, s.reconciliation_status
    FROM share_counts s
    JOIN market_heads h ON h.security_id = s.security_id AND h.data_kind = 'SHARES' AND h.batch_id = s.batch_id
    WHERE s.security_id = b.security_id AND s.effective_date <= b.trading_date
    ORDER BY s.effective_date DESC FETCH FIRST 1 ROW ONLY
  ) sh
  LEFT JOIN v_valuation_inputs vi ON vi.company_id = b.company_id AND vi.fiscal_year = b.report_year
)
SELECT j.company_id, j.symbol, j.trading_date, j.close_vnd, j.policy_code, j.report_year,
  j.shares_outstanding, j.shares_effective_date, j.shares_check,
  j.parent_net_income, j.equity, j.non_controlling_interest, j.parent_equity, j.input_status,
  j.close_vnd * j.shares_outstanding market_cap,
  CASE WHEN j.shares_outstanding IS NOT NULL AND j.input_status = 'VERIFIED' THEN j.parent_net_income / j.shares_outstanding END eps,
  CASE WHEN j.shares_outstanding IS NOT NULL AND j.input_status = 'VERIFIED' AND j.parent_net_income > 0
       THEN j.close_vnd * j.shares_outstanding / j.parent_net_income END pe,
  CASE WHEN j.shares_outstanding IS NOT NULL AND j.input_status = 'VERIFIED' THEN j.parent_equity / j.shares_outstanding END bvps,
  CASE WHEN j.shares_outstanding IS NOT NULL AND j.input_status = 'VERIFIED' AND j.parent_equity > 0
       THEN j.close_vnd * j.shares_outstanding / j.parent_equity END pb,
  CASE WHEN j.shares_outstanding IS NULL THEN 'NO_SHARES' ELSE 'VALID' END market_cap_status,
  CASE WHEN j.shares_outstanding IS NULL THEN 'NO_SHARES' WHEN j.input_status IS NULL THEN 'NO_REPORT'
       WHEN j.input_status <> 'VERIFIED' THEN j.input_status WHEN j.parent_net_income <= 0 THEN 'NEGATIVE_EARNINGS'
       ELSE 'VALID' END pe_status,
  CASE WHEN j.shares_outstanding IS NULL THEN 'NO_SHARES' WHEN j.input_status IS NULL THEN 'NO_REPORT'
       WHEN j.input_status <> 'VERIFIED' THEN j.input_status WHEN j.parent_equity <= 0 THEN 'NEGATIVE_BOOK'
       ELSE 'VALID' END pb_status
FROM joined j
WITH READ ONLY;

CREATE OR REPLACE VIEW v_market_metric_catalog AS
SELECT metric_code, metric_group, metric_name, display_unit, formula_text, formula_version, sort_order
FROM market_metric_definitions
WITH READ ONLY;

-- Import errors now also point at market staging rows (columns kept, record_kind appended).
CREATE OR REPLACE VIEW v_import_errors AS
SELECT e.error_id, e.batch_id, NVL(s.row_no, m.row_no) row_no, NVL(s.source_symbol, m.source_symbol) source_symbol,
  NVL(s.fiscal_year_raw, CASE WHEN m.record_kind = 'CAPITAL' THEN SUBSTR(m.record_key, 1, 4) END) fiscal_year_raw,
  NVL(s.item_code_raw, CASE WHEN m.staging_id IS NOT NULL THEN m.record_kind || ':' || m.record_key END) item_code_raw,
  e.error_code, e.error_message, e.logged_at, m.record_kind
FROM etl_errors e
LEFT JOIN staging_facts s ON s.staging_id = e.staging_id AND s.batch_id = e.batch_id
LEFT JOIN staging_market_rows m ON m.staging_id = e.market_staging_id AND m.batch_id = e.batch_id
WITH READ ONLY;
