-- Execute as ERP_ETL. Operational status is intentionally not granted to APP.
SELECT batch_id,batch_status,received_count,imported_count,rejected_count,skipped_count
FROM ERP_DESIGN_V1.v_etl_batches ORDER BY batch_id;

SELECT batch_id,error_code,error_message FROM ERP_DESIGN_V1.v_etl_errors ORDER BY error_id;

SELECT symbol,fiscal_year,run_id,run_status,result_count,current_snapshot_matches,previous_snapshot_matches
FROM ERP_DESIGN_V1.v_calculation_runs ORDER BY symbol,fiscal_year,run_id;
