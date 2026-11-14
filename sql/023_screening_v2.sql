-- Screening v2 (docs/18): adds screen_at(date, conditions) combining financial, valuation
-- and market metrics at one date. screen(year, conditions) keeps its signature and result.
-- Install after 022 (CURRENT_SCHEMA = owner).
--   SELECT * FROM TABLE(owner.pkg_screening.screen_at(DATE '2025-06-30',
--     '[{"metric":"ROE","op":">=","value":0.15},{"metric":"PE","op":"<=","value":12},{"metric":"RETURN_1Y","op":">","value":0}]'));
-- Thresholds use storage units: PERCENT as a ratio (0.15 = 15%), TIMES as times, VND in dong.
-- Each company is evaluated on its latest session <= date; financial metrics use the report
-- year chosen by the active valuation policy for that date. Same PASS/FAIL/UNKNOWN rules.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF
CREATE OR REPLACE PACKAGE pkg_screening AUTHID DEFINER AS
  c_formula CONSTANT VARCHAR2(20) := '1.0.0';
  TYPE t_row IS RECORD (
    company_id NUMBER, symbol VARCHAR2(20), company_name VARCHAR2(250), fiscal_year NUMBER,
    overall_status VARCHAR2(8), passed_count NUMBER, failed_count NUMBER, unknown_count NUMBER,
    details VARCHAR2(4000));
  TYPE t_tab IS TABLE OF t_row;
  TYPE t_row_at IS RECORD (
    company_id NUMBER, symbol VARCHAR2(20), company_name VARCHAR2(250), as_of_date DATE, trading_date DATE,
    report_year NUMBER, policy_code VARCHAR2(30), overall_status VARCHAR2(8), passed_count NUMBER, failed_count NUMBER,
    unknown_count NUMBER, details VARCHAR2(4000));
  TYPE t_tab_at IS TABLE OF t_row_at;
  FUNCTION screen(p_year NUMBER, p_conditions VARCHAR2) RETURN t_tab PIPELINED;
  FUNCTION screen_at(p_date DATE, p_conditions VARCHAR2) RETURN t_tab_at PIPELINED;
END;
/
CREATE OR REPLACE PACKAGE BODY pkg_screening AS
  PROCEDURE validate(p_year NUMBER, p_conditions VARCHAR2) IS
    v_total NUMBER; v_bad_metric VARCHAR2(200); v_bad_op VARCHAR2(200); v_no_value NUMBER;
  BEGIN
    IF p_year IS NULL OR p_year <> TRUNC(p_year) OR p_year NOT BETWEEN 1900 AND 2200 THEN
      raise_application_error(-20401, 'Fiscal year must be an integer year');
    END IF;
    IF p_conditions IS NULL OR p_conditions IS NOT JSON THEN
      raise_application_error(-20402, 'Conditions must be a JSON array');
    END IF;
    SELECT COUNT(*),
           MAX(CASE WHEN NOT EXISTS (SELECT 1 FROM metric_definitions d
                                     WHERE d.metric_code = j.metric AND d.formula_version = c_formula)
                    THEN NVL(j.metric, '(null)') END),
           MAX(CASE WHEN j.op IS NULL OR j.op NOT IN ('>=', '>', '<=', '<', '=') THEN NVL(j.op, '(null)') END),
           SUM(CASE WHEN j.threshold IS NULL THEN 1 ELSE 0 END)
      INTO v_total, v_bad_metric, v_bad_op, v_no_value
      FROM JSON_TABLE(p_conditions, '$[*]' COLUMNS (
             metric VARCHAR2(200) PATH '$.metric',
             op VARCHAR2(200) PATH '$.op',
             threshold NUMBER PATH '$.value')) j;
    IF v_total NOT BETWEEN 1 AND 10 THEN
      raise_application_error(-20402, 'Provide between 1 and 10 conditions');
    ELSIF v_bad_metric IS NOT NULL THEN
      raise_application_error(-20403, 'Unknown metric for formula ' || c_formula || ': ' || SUBSTR(v_bad_metric, 1, 60));
    ELSIF v_bad_op IS NOT NULL THEN
      raise_application_error(-20404, 'Operator must be one of >=, >, <=, <, =');
    ELSIF v_no_value > 0 THEN
      raise_application_error(-20405, 'Every condition needs a numeric value');
    END IF;
  END;

  FUNCTION screen(p_year NUMBER, p_conditions VARCHAR2) RETURN t_tab PIPELINED IS
  BEGIN
    validate(p_year, p_conditions);
    FOR r IN (
      WITH cond AS (
        SELECT j.ord, j.metric, j.op, j.threshold
        FROM JSON_TABLE(p_conditions, '$[*]' COLUMNS (
               ord FOR ORDINALITY,
               metric VARCHAR2(60) PATH '$.metric',
               op VARCHAR2(2) PATH '$.op',
               threshold NUMBER PATH '$.value')) j
      ), ev AS (
        SELECT d.company_id, d.symbol, d.company_name, c.ord, c.metric, c.op, c.threshold,
          m.metric_value, m.display_value, m.display_unit, m.result_status,
          CASE WHEN m.result_status = 'VALID' AND m.metric_value IS NOT NULL THEN
            CASE WHEN (c.op = '>=' AND m.metric_value >= c.threshold) OR (c.op = '>' AND m.metric_value > c.threshold)
                   OR (c.op = '<=' AND m.metric_value <= c.threshold) OR (c.op = '<' AND m.metric_value < c.threshold)
                   OR (c.op = '=' AND m.metric_value = c.threshold)
                 THEN 'PASS' ELSE 'FAIL' END
          ELSE 'UNKNOWN' END cond_status
        FROM v_company_directory d
        CROSS JOIN cond c
        LEFT JOIN v_current_metrics m
          ON m.company_id = d.company_id AND m.fiscal_year = p_year
         AND m.scope_code = 'CONSOLIDATED' AND m.metric_code = c.metric AND m.formula_version = c_formula
      )
      SELECT company_id, symbol, company_name,
        SUM(CASE WHEN cond_status = 'PASS' THEN 1 ELSE 0 END) passed_count,
        SUM(CASE WHEN cond_status = 'FAIL' THEN 1 ELSE 0 END) failed_count,
        SUM(CASE WHEN cond_status = 'UNKNOWN' THEN 1 ELSE 0 END) unknown_count,
        JSON_ARRAYAGG(JSON_OBJECT(
          'metric' VALUE metric, 'op' VALUE op, 'threshold' VALUE threshold,
          'value' VALUE metric_value, 'display_value' VALUE display_value, 'unit' VALUE display_unit,
          'metric_status' VALUE NVL(result_status, 'NOT_AVAILABLE'), 'condition_status' VALUE cond_status)
          ORDER BY ord RETURNING VARCHAR2(4000)) details
      FROM ev
      GROUP BY company_id, symbol, company_name
    ) LOOP
      PIPE ROW (t_row(r.company_id, r.symbol, r.company_name, p_year,
        CASE WHEN r.failed_count > 0 THEN 'FAIL' WHEN r.unknown_count > 0 THEN 'UNKNOWN' ELSE 'PASS' END,
        r.passed_count, r.failed_count, r.unknown_count, r.details));
    END LOOP;
    RETURN;
  END;
  PROCEDURE validate_at(p_date DATE, p_conditions VARCHAR2) IS
    v_total NUMBER; v_bad_metric VARCHAR2(200); v_bad_op VARCHAR2(200); v_no_value NUMBER;
  BEGIN
    IF p_date IS NULL OR p_date <> TRUNC(p_date) OR p_date NOT BETWEEN DATE '1900-01-01' AND DATE '2200-12-31' THEN
      raise_application_error(-20406, 'Screening date must be a calendar date');
    END IF;
    IF p_conditions IS NULL OR p_conditions IS NOT JSON THEN
      raise_application_error(-20402, 'Conditions must be a JSON array');
    END IF;
    SELECT COUNT(*),
           MAX(CASE WHEN NOT EXISTS (SELECT 1 FROM metric_definitions d WHERE d.metric_code = j.metric AND d.formula_version = c_formula)
                     AND NOT EXISTS (SELECT 1 FROM market_metric_definitions k WHERE k.metric_code = j.metric)
                    THEN NVL(j.metric, '(null)') END),
           MAX(CASE WHEN j.op IS NULL OR j.op NOT IN ('>=', '>', '<=', '<', '=') THEN NVL(j.op, '(null)') END),
           SUM(CASE WHEN j.threshold IS NULL THEN 1 ELSE 0 END)
      INTO v_total, v_bad_metric, v_bad_op, v_no_value
      FROM JSON_TABLE(p_conditions, '$[*]' COLUMNS (
             metric VARCHAR2(200) PATH '$.metric', op VARCHAR2(200) PATH '$.op', threshold NUMBER PATH '$.value')) j;
    IF v_total NOT BETWEEN 1 AND 10 THEN
      raise_application_error(-20402, 'Provide between 1 and 10 conditions');
    ELSIF v_bad_metric IS NOT NULL THEN
      raise_application_error(-20403, 'Unknown metric: ' || SUBSTR(v_bad_metric, 1, 60));
    ELSIF v_bad_op IS NOT NULL THEN
      raise_application_error(-20404, 'Operator must be one of >=, >, <=, <, =');
    ELSIF v_no_value > 0 THEN
      raise_application_error(-20405, 'Every condition needs a numeric value');
    END IF;
  END;

  FUNCTION screen_at(p_date DATE, p_conditions VARCHAR2) RETURN t_tab_at PIPELINED IS
  BEGIN
    validate_at(p_date, p_conditions);
    FOR r IN (
      WITH cond AS (
        SELECT j.ord, j.metric, j.op, j.threshold,
          NVL((SELECT k.metric_group FROM market_metric_definitions k WHERE k.metric_code = j.metric), 'FINANCIAL') metric_group,
          COALESCE((SELECT k.display_unit FROM market_metric_definitions k WHERE k.metric_code = j.metric),
                   (SELECT d.display_unit FROM metric_definitions d WHERE d.metric_code = j.metric AND d.formula_version = c_formula)) unit
        FROM JSON_TABLE(p_conditions, '$[*]' COLUMNS (
               ord FOR ORDINALITY, metric VARCHAR2(60) PATH '$.metric', op VARCHAR2(2) PATH '$.op', threshold NUMBER PATH '$.value')) j
      ), pol AS (
        SELECT policy_code,
          EXTRACT(YEAR FROM p_date) - CASE WHEN p_date >= ADD_MONTHS(TRUNC(p_date, 'YYYY'), available_month - 1) + available_day - 1
                                           THEN 1 ELSE 2 END report_year
        FROM valuation_policies WHERE is_active = 1
      ), sess AS (
        -- Latest session on or before the date, per company (index range on mv_market_daily_u1).
        SELECT /*+ MATERIALIZE */ d.company_id, d.security_id, MAX(m.trading_date) trading_date
        FROM v_company_directory d LEFT JOIN mv_market_daily m ON m.security_id = d.security_id AND m.trading_date <= p_date
        GROUP BY d.company_id, d.security_id
      ), mm AS (
        -- Each heavy view is evaluated once for the companies/sessions/metrics involved, not
        -- once per company x condition (docs/19: 600 companies 4.7 s before this change).
        SELECT /*+ MATERIALIZE */ m.* FROM v_market_metrics_daily m JOIN sess s ON s.company_id = m.company_id AND s.trading_date = m.trading_date
      ), vv AS (
        -- The date range lets Oracle push a range predicate into the view before the join.
        SELECT /*+ MATERIALIZE */ v.* FROM v_valuation_daily v JOIN sess s ON s.company_id = v.company_id AND s.trading_date = v.trading_date
        WHERE v.trading_date BETWEEN (SELECT MIN(trading_date) FROM sess) AND p_date
          AND EXISTS (SELECT 1 FROM cond WHERE metric_group = 'VALUATION')
      ), fm AS (
        SELECT /*+ MATERIALIZE */ f.company_id, f.metric_code, f.metric_value, f.result_status
        FROM v_current_metrics f CROSS JOIN pol
        WHERE f.fiscal_year = pol.report_year AND f.scope_code = 'CONSOLIDATED' AND f.formula_version = c_formula
          AND f.metric_code IN (SELECT metric FROM cond WHERE metric_group = 'FINANCIAL')
      ), vals AS (
        SELECT d.company_id, d.symbol, d.company_name, s.trading_date, pol.report_year, pol.policy_code,
          c.ord, c.metric, c.op, c.threshold, c.metric_group, c.unit,
          CASE c.metric
            WHEN 'CLOSE_PRICE' THEN mm.close_vnd WHEN 'RETURN_1M' THEN mm.ret_1m WHEN 'RETURN_3M' THEN mm.ret_3m
            WHEN 'RETURN_6M' THEN mm.ret_6m WHEN 'RETURN_1Y' THEN mm.ret_1y WHEN 'VOLATILITY_1Y' THEN mm.volatility_1y
            WHEN 'MA20' THEN mm.ma20 WHEN 'MA50' THEN mm.ma50 WHEN 'MA200' THEN mm.ma200
            WHEN 'HIGH_52W' THEN mm.high_52w WHEN 'LOW_52W' THEN mm.low_52w WHEN 'DIST_52W_HIGH' THEN mm.dist_52w_high
            WHEN 'MARKET_CAP' THEN vv.market_cap WHEN 'PE' THEN vv.pe WHEN 'PB' THEN vv.pb WHEN 'EPS' THEN vv.eps WHEN 'BVPS' THEN vv.bvps
            ELSE CASE WHEN fm.result_status = 'VALID' THEN fm.metric_value END
          END metric_value,
          CASE
            WHEN c.metric_group = 'FINANCIAL' THEN NVL(fm.result_status, 'NOT_AVAILABLE')
            WHEN s.trading_date IS NULL THEN 'NO_PRICE'
            WHEN c.metric_group = 'MARKET' THEN 'VALID'
            WHEN c.metric = 'MARKET_CAP' THEN vv.market_cap_status
            WHEN c.metric = 'PE' THEN vv.pe_status
            WHEN c.metric = 'PB' THEN vv.pb_status
            WHEN c.metric = 'EPS' THEN CASE WHEN vv.pe_status = 'NEGATIVE_EARNINGS' THEN 'VALID' ELSE vv.pe_status END
            ELSE CASE WHEN vv.pb_status = 'NEGATIVE_BOOK' THEN 'VALID' ELSE vv.pb_status END
          END base_status
        FROM v_company_directory d
        CROSS JOIN cond c CROSS JOIN pol
        LEFT JOIN sess s ON s.company_id = d.company_id
        LEFT JOIN mm ON mm.company_id = d.company_id
        LEFT JOIN vv ON vv.company_id = d.company_id
        LEFT JOIN fm ON fm.company_id = d.company_id AND fm.metric_code = c.metric
      ), ev AS (
        SELECT vals.*,
          CASE WHEN base_status = 'VALID' AND metric_value IS NULL THEN 'INSUFFICIENT_HISTORY' ELSE base_status END metric_status,
          CASE WHEN base_status = 'VALID' AND metric_value IS NOT NULL THEN
            CASE WHEN (op = '>=' AND metric_value >= threshold) OR (op = '>' AND metric_value > threshold)
                   OR (op = '<=' AND metric_value <= threshold) OR (op = '<' AND metric_value < threshold)
                   OR (op = '=' AND metric_value = threshold)
                 THEN 'PASS' ELSE 'FAIL' END
          ELSE 'UNKNOWN' END cond_status
        FROM vals
      )
      SELECT company_id, symbol, company_name, MAX(trading_date) trading_date, MAX(report_year) report_year, MAX(policy_code) policy_code,
        SUM(CASE WHEN cond_status = 'PASS' THEN 1 ELSE 0 END) passed_count,
        SUM(CASE WHEN cond_status = 'FAIL' THEN 1 ELSE 0 END) failed_count,
        SUM(CASE WHEN cond_status = 'UNKNOWN' THEN 1 ELSE 0 END) unknown_count,
        JSON_ARRAYAGG(JSON_OBJECT(
          'metric' VALUE metric, 'group' VALUE metric_group, 'op' VALUE op, 'threshold' VALUE threshold,
          'value' VALUE metric_value, 'unit' VALUE unit,
          'metric_status' VALUE metric_status, 'condition_status' VALUE cond_status)
          ORDER BY ord RETURNING VARCHAR2(4000)) details
      FROM ev
      GROUP BY company_id, symbol, company_name
    ) LOOP
      PIPE ROW (t_row_at(r.company_id, r.symbol, r.company_name, p_date, r.trading_date, r.report_year, r.policy_code,
        CASE WHEN r.failed_count > 0 THEN 'FAIL' WHEN r.unknown_count > 0 THEN 'UNKNOWN' ELSE 'PASS' END,
        r.passed_count, r.failed_count, r.unknown_count, r.details));
    END LOOP;
    RETURN;
  END;
END;
/
