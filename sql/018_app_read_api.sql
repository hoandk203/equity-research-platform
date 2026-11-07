-- Install in the application schema after 008/009 (CURRENT_SCHEMA = owner).
-- Read model for the five application screens that 008 did not yet cover:
--   FR-02 detail  -> v_report_lines
--   FR-06 imports -> v_import_batches, v_import_errors (APP-facing; ETL keeps its own views)
--   FR-04 screen  -> pkg_screening.screen (PASS/FAIL/UNKNOWN evaluated in the database)
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

-- One row per current report set x financial item. Items without a selected fact still
-- appear with line_status MISSING and NULL values, so the screen can show the gap.
-- Effective value follows the selected correction; a selected correction with NULL VND
-- stays NULL (no silent fallback to the replaced provider number).
CREATE OR REPLACE VIEW v_report_lines AS
SELECT s.company_id, s.symbol, s.company_name, s.fiscal_year, s.scope_code,
  s.report_set_id, s.selection_version, s.dataset_version, s.acceptance_status, s.publication_status,
  fi.statement_kind, fi.item_id, fi.item_code,
  NVL(f.raw_name, fi.item_name) line_name, f.raw_code,
  rsf.selection_fact_id, NVL(rsf.selected_quality, 'MISSING') line_status,
  f.value_vnd provider_value_vnd,
  CASE WHEN rsf.correction_id IS NULL THEN f.value_vnd ELSE c.new_value_vnd END effective_value_vnd,
  CASE WHEN rsf.correction_id IS NULL THEN 0 ELSE 1 END is_corrected,
  c.correction_key, c.reason correction_reason, c.review_status correction_status, c.evidence_page correction_page,
  pdf.sha256 correction_pdf_sha256, pdf.source_url correction_pdf_url,
  fr.report_id, fr.report_version, fr.source_report_type, fr.currency_code, fr.original_unit, fr.unit_multiplier,
  fr.fiscal_start, fr.fiscal_end, fr.publication_at, fr.metadata_status,
  pa.sha256 provider_sha256, pa.source_url provider_url,
  (SELECT COUNT(*) FROM quality_issues qi
    WHERE qi.report_id = fr.report_id AND (qi.fact_id IS NULL OR qi.fact_id = f.fact_id)
      AND qi.issue_status = 'OPEN') open_issue_count
FROM v_current_report_sets s
CROSS JOIN financial_items fi
LEFT JOIN report_set_members rm ON rm.report_set_id = s.report_set_id AND rm.statement_kind = fi.statement_kind
LEFT JOIN financial_reports fr ON fr.report_id = rm.report_id
LEFT JOIN source_artifacts pa ON pa.artifact_id = fr.artifact_id
LEFT JOIN report_set_facts rsf ON rsf.report_set_id = s.report_set_id AND rsf.item_id = fi.item_id
LEFT JOIN financial_facts f ON f.fact_id = rsf.fact_id
LEFT JOIN fact_corrections c ON c.correction_id = rsf.correction_id
LEFT JOIN source_artifacts pdf ON pdf.artifact_id = c.evidence_artifact_id
WITH READ ONLY;

-- Import monitoring for the application (FR-06). No staging payload, no file paths.
CREATE OR REPLACE VIEW v_import_batches AS
SELECT b.batch_id, b.batch_key, b.contract_version, b.mapping_version, b.batch_status,
  b.started_at, b.finished_at, b.received_count, b.imported_count, b.rejected_count, b.skipped_count,
  (SELECT COUNT(*) FROM etl_errors e WHERE e.batch_id = b.batch_id) error_count
FROM etl_batches b
WITH READ ONLY;

CREATE OR REPLACE VIEW v_import_errors AS
SELECT e.error_id, e.batch_id, s.row_no, s.source_symbol, s.fiscal_year_raw, s.item_code_raw,
  e.error_code, e.error_message, e.logged_at
FROM etl_errors e LEFT JOIN staging_facts s ON s.staging_id = e.staging_id AND s.batch_id = e.batch_id
WITH READ ONLY;

-- Multi-condition AND screening (FR-04).
--   SELECT * FROM TABLE(owner.pkg_screening.screen(2024,
--     '[{"metric":"NET_MARGIN","op":">=","value":0.10},{"metric":"CURRENT_RATIO","op":">=","value":1.0}]'));
-- Thresholds are plain ratios (0.10 = 10%). A condition is PASS/FAIL only on a VALID current
-- value; anything else (missing, blocked, provisional) is UNKNOWN. Overall: any FAIL -> FAIL,
-- else any UNKNOWN -> UNKNOWN, else PASS. Provisional values never enter the PASS set.
CREATE OR REPLACE PACKAGE pkg_screening AUTHID DEFINER AS
  c_formula CONSTANT VARCHAR2(20) := '1.0.0';
  TYPE t_row IS RECORD (
    company_id NUMBER, symbol VARCHAR2(20), company_name VARCHAR2(250), fiscal_year NUMBER,
    overall_status VARCHAR2(8), passed_count NUMBER, failed_count NUMBER, unknown_count NUMBER,
    details VARCHAR2(4000));
  TYPE t_tab IS TABLE OF t_row;
  FUNCTION screen(p_year NUMBER, p_conditions VARCHAR2) RETURN t_tab PIPELINED;
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
END;
/
