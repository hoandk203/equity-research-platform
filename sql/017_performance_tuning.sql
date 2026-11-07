-- Run in the application schema after 008 (CURRENT_SCHEMA = owner). Idempotent.
-- Measured on ERP_PERF_TEST (200x pilot volume); see docs/11 and evidence/oracle_performance.
--
-- v_metric_lineage finds the staging row (issuer PDF id/page) of each input by five columns.
-- Without this index the lookup scanned every staging row, including the CLOB-bearing blocks.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF
DECLARE n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM user_indexes WHERE index_name = 'STAGING_FACTS_IX3';
  IF n = 0 THEN
    EXECUTE IMMEDIATE 'CREATE INDEX staging_facts_ix3 ON staging_facts '
      || '(batch_id, artifact_id, source_symbol, fiscal_year_raw, item_code_raw) ONLINE';
  END IF;
END;
/
-- The second change is in sql/008_read_views.sql: v_current_metrics partitions its ranking
-- window by symbol/company_key as well, so single-company lookups are not computed for every
-- company first. Re-run 008 (CREATE OR REPLACE keeps grants) when applying this migration.
