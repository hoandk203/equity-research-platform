-- Execute as ERP_APP using scripts/oracle_access.py. No base-table privileges.
SELECT symbol,company_name FROM ERP_DESIGN_V1.v_company_directory ORDER BY symbol;

SELECT symbol,fiscal_year,metric_code,display_value,display_unit,result_status
FROM ERP_DESIGN_V1.v_current_metrics WHERE fiscal_year=2025
ORDER BY symbol,metric_code;

-- Example SQL filter; thresholds are demonstration inputs, not investment advice.
SELECT symbol FROM ERP_DESIGN_V1.v_screening_metrics
WHERE fiscal_year=2025 AND scope_code='CONSOLIDATED' AND metric_code='ROE' AND metric_value>=0.15
INTERSECT
SELECT symbol FROM ERP_DESIGN_V1.v_screening_metrics
WHERE fiscal_year=2025 AND scope_code='CONSOLIDATED' AND metric_code='LIABILITIES_ASSETS' AND metric_value<=0.60;

SELECT l.symbol,l.fiscal_year,l.metric_code,l.input_position,l.input_year,l.item_code,l.effective_value_vnd,
  l.correction_key,l.issuer_pdf_sha256,l.issuer_pdf_page
FROM ERP_DESIGN_V1.v_metric_lineage l JOIN ERP_DESIGN_V1.v_current_metrics m ON m.result_id=l.result_id
WHERE l.symbol='VNM' AND l.fiscal_year=2025 AND l.metric_code='ROE'
ORDER BY l.input_position;
