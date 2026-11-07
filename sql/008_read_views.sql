-- Install in the owned application schema. All public/operational views are read-only.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF

CREATE OR REPLACE VIEW v_company_directory AS
SELECT c.company_id,c.company_key,c.company_name,s.security_id,s.symbol,s.exchange_code
FROM companies c LEFT JOIN (
  SELECT sec.*,ROW_NUMBER() OVER(PARTITION BY company_id ORDER BY CASE WHEN exchange_code='HOSE' THEN 0 ELSE 1 END,security_id) listing_rank
  FROM securities sec WHERE security_kind='COMMON_STOCK'
) s ON s.company_id=c.company_id AND s.listing_rank=1
WITH READ ONLY;

CREATE OR REPLACE VIEW v_current_report_sets AS
SELECT d.company_id,d.company_key,d.company_name,d.symbol,d.exchange_code,s.fiscal_year,s.scope_code,
  s.report_set_id,s.selection_version,s.dataset_version,s.acceptance_status,s.temporal_mode,s.created_at,h.lock_version,
  CASE WHEN EXISTS(SELECT 1 FROM report_set_members rm JOIN financial_reports fr ON fr.report_id=rm.report_id
                   WHERE rm.report_set_id=s.report_set_id AND fr.publication_at IS NULL)
       THEN 'UNKNOWN' ELSE 'KNOWN' END publication_status
FROM report_heads h JOIN report_sets s ON s.report_set_id=h.report_set_id
JOIN v_company_directory d ON d.company_id=s.company_id
WITH READ ONLY;

CREATE OR REPLACE VIEW v_metric_history AS
SELECT d.company_id,d.company_key,d.company_name,d.symbol,d.exchange_code,s.fiscal_year,s.scope_code,
  cr.run_id,cr.run_key,cr.engine_version,cr.started_at,cr.report_set_id,cr.previous_set_id,
  s.dataset_version,s.temporal_mode,m.metric_id,m.metric_code,m.formula_version,m.metric_name,m.display_unit,
  mr.result_id,mr.metric_value,mr.result_status,mr.reason_codes,
  (SELECT COUNT(*) FROM metric_dependencies md WHERE md.metric_id=m.metric_id) expected_input_count,
  (SELECT COUNT(*) FROM metric_input_facts mif WHERE mif.result_id=mr.result_id) actual_input_count,
  CASE WHEN EXISTS(SELECT 1 FROM metric_dependencies md WHERE md.metric_id=m.metric_id AND md.year_offset=-1) THEN 1 ELSE 0 END requires_previous,
  CASE WHEN EXISTS(
    SELECT 1 FROM metric_input_facts mif JOIN report_set_facts sf ON sf.selection_fact_id=mif.selection_fact_id
    JOIN quality_issues qi ON qi.report_id=sf.report_id AND (qi.fact_id IS NULL OR qi.fact_id=sf.fact_id)
    WHERE mif.result_id=mr.result_id AND qi.issue_status='OPEN' AND qi.severity IN ('HIGH','CRITICAL')
  ) THEN 1 ELSE 0 END has_open_quality_issue
FROM metric_results mr JOIN calculation_runs cr ON cr.run_id=mr.run_id
JOIN report_sets s ON s.report_set_id=cr.report_set_id JOIN metric_definitions m ON m.metric_id=mr.metric_id
JOIN v_company_directory d ON d.company_id=s.company_id
WHERE cr.run_status='COMPLETED'
WITH READ ONLY;

CREATE OR REPLACE VIEW v_current_metrics AS
WITH matching AS (
  -- symbol/company_key are functionally dependent on company_id (one listing per company in
  -- v_company_directory); partitioning on them changes no result but lets Oracle push a
  -- symbol filter below the window (sql/017, evidence/oracle_performance).
  SELECT hist.*,ROW_NUMBER() OVER(
    PARTITION BY hist.company_id,hist.symbol,hist.company_key,hist.fiscal_year,hist.scope_code,hist.metric_code,hist.formula_version,hist.engine_version
    ORDER BY hist.started_at DESC,hist.run_id DESC) recency_rank
  FROM v_metric_history hist
  JOIN report_heads ch ON ch.company_id=hist.company_id AND ch.fiscal_year=hist.fiscal_year
    AND ch.scope_code=hist.scope_code AND ch.report_set_id=hist.report_set_id
  LEFT JOIN report_heads ph ON ph.company_id=hist.company_id AND ph.fiscal_year=hist.fiscal_year-1 AND ph.scope_code=hist.scope_code
  WHERE hist.engine_version='metric-engine/1.0.0' AND hist.formula_version='1.0.0'
    AND (hist.requires_previous=0 OR DECODE(hist.previous_set_id,ph.report_set_id,1,0)=1)
), effective AS (
  SELECT matching.*,
    CASE WHEN has_open_quality_issue=1 OR (result_status='VALID' AND actual_input_count<>expected_input_count)
         THEN 'BLOCKED_INPUT_QUALITY' ELSE result_status END effective_status
  FROM matching WHERE recency_rank=1
)
SELECT company_id,company_key,company_name,symbol,exchange_code,fiscal_year,scope_code,
  run_id,run_key,engine_version,started_at,report_set_id,previous_set_id,dataset_version,temporal_mode,
  metric_id,metric_code,formula_version,metric_name,display_unit,result_id,
  CASE WHEN effective_status IN ('VALID','CALCULATED_PROVISIONAL') THEN metric_value ELSE NULL END metric_value,
  effective_status result_status,
  CASE WHEN has_open_quality_issue=1 THEN 'CURRENT_OPEN_QUALITY_ISSUE'
       WHEN result_status='VALID' AND actual_input_count<>expected_input_count THEN 'INCOMPLETE_STORED_LINEAGE'
       ELSE reason_codes END reason_codes,
  CASE WHEN effective_status IN ('VALID','CALCULATED_PROVISIONAL')
       THEN ROUND(metric_value*CASE WHEN display_unit='PERCENT' THEN 100 ELSE 1 END,2) END display_value,
  expected_input_count,actual_input_count,requires_previous
FROM effective
WITH READ ONLY;

CREATE OR REPLACE VIEW v_screening_metrics AS
SELECT * FROM v_current_metrics WHERE result_status='VALID' AND metric_value IS NOT NULL
WITH READ ONLY;

CREATE OR REPLACE VIEW v_metric_lineage AS
SELECT hist.company_id,hist.symbol,hist.fiscal_year,hist.scope_code,hist.run_id,hist.result_id,
  hist.metric_code,hist.formula_version,hist.engine_version,mi.input_position,dep.year_offset,
  sf.selection_fact_id,sf.report_set_id input_set_id,inp.fiscal_year input_year,fi.item_code,
  sf.fact_id,sf.correction_id,sf.selected_quality,f.value_vnd provider_value_vnd,
  CASE WHEN sf.correction_id IS NULL THEN f.value_vnd ELSE corr.new_value_vnd END effective_value_vnd,
  f.raw_code,f.raw_name,corr.correction_key,corr.review_status correction_status,
  pa.sha256 provider_sha256,pa.source_url provider_url,
  pdf.sha256 issuer_pdf_sha256,pdf.source_url issuer_pdf_url,
  CASE WHEN sf.correction_id IS NOT NULL THEN corr.evidence_page
       ELSE JSON_VALUE(st.payload,'$.evidence_page' RETURNING NUMBER NULL ON ERROR) END issuer_pdf_page,
  JSON_VALUE(st.payload,'$.source_column' RETURNING VARCHAR2(20) NULL ON ERROR) source_column
FROM v_metric_history hist JOIN metric_input_facts mi ON mi.result_id=hist.result_id
JOIN metric_dependencies dep ON dep.metric_id=hist.metric_id AND dep.input_position=mi.input_position
JOIN report_set_facts sf ON sf.selection_fact_id=mi.selection_fact_id
JOIN report_sets inp ON inp.report_set_id=sf.report_set_id JOIN financial_items fi ON fi.item_id=sf.item_id
JOIN financial_facts f ON f.fact_id=sf.fact_id JOIN financial_reports fr ON fr.report_id=sf.report_id
JOIN source_artifacts pa ON pa.artifact_id=fr.artifact_id
LEFT JOIN fact_corrections corr ON corr.correction_id=sf.correction_id
LEFT JOIN staging_facts st ON st.batch_id=fr.batch_id AND st.artifact_id=fr.artifact_id
  AND st.source_symbol=hist.company_key AND st.fiscal_year_raw=TO_CHAR(fr.fiscal_year) AND st.item_code_raw=fi.item_code
LEFT JOIN source_artifacts pdf ON pdf.artifact_id=CASE WHEN sf.correction_id IS NOT NULL THEN corr.evidence_artifact_id
  ELSE JSON_VALUE(st.payload,'$.issuer_artifact_id' RETURNING NUMBER NULL ON ERROR) END
WITH READ ONLY;

CREATE OR REPLACE VIEW v_etl_batches AS
SELECT batch_id,batch_key,contract_version,mapping_version,batch_status,started_at,finished_at,
  received_count,imported_count,rejected_count,skipped_count FROM etl_batches
WITH READ ONLY;

CREATE OR REPLACE VIEW v_etl_errors AS
SELECT e.error_id,e.batch_id,e.staging_id,s.row_no,s.source_symbol,s.fiscal_year_raw,s.item_code_raw,
  e.error_code,e.error_message,e.logged_at
FROM etl_errors e LEFT JOIN staging_facts s ON s.staging_id=e.staging_id AND s.batch_id=e.batch_id
WITH READ ONLY;

CREATE OR REPLACE VIEW v_calculation_runs AS
SELECT d.company_id,d.symbol,s.fiscal_year,s.scope_code,cr.run_id,cr.run_key,cr.report_set_id,cr.previous_set_id,
  cr.engine_version,cr.run_status,cr.started_at,
  CASE WHEN ch.report_set_id=cr.report_set_id THEN 1 ELSE 0 END current_snapshot_matches,
  DECODE(ph.report_set_id,cr.previous_set_id,1,0) previous_snapshot_matches,
  (SELECT COUNT(*) FROM metric_results mr WHERE mr.run_id=cr.run_id) result_count
FROM calculation_runs cr JOIN report_sets s ON s.report_set_id=cr.report_set_id
JOIN v_company_directory d ON d.company_id=s.company_id
LEFT JOIN report_heads ch ON ch.company_id=s.company_id AND ch.fiscal_year=s.fiscal_year AND ch.scope_code=s.scope_code
LEFT JOIN report_heads ph ON ph.company_id=s.company_id AND ph.fiscal_year=s.fiscal_year-1 AND ph.scope_code=s.scope_code
WITH READ ONLY;
