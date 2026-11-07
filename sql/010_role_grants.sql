-- Template tokens are substituted only from the installer's fixed allowlist.
-- READ permits queries without the SELECT privilege's row/table locking powers.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF
GRANT READ ON __OWNER__.v_company_directory TO __APP_ROLE__;
GRANT READ ON __OWNER__.v_current_report_sets TO __APP_ROLE__;
GRANT READ ON __OWNER__.v_metric_history TO __APP_ROLE__;
GRANT READ ON __OWNER__.v_current_metrics TO __APP_ROLE__;
GRANT READ ON __OWNER__.v_screening_metrics TO __APP_ROLE__;
GRANT READ ON __OWNER__.v_metric_lineage TO __APP_ROLE__;
-- Added by 018: detail lines, import monitoring and the screening function.
GRANT READ ON __OWNER__.v_report_lines TO __APP_ROLE__;
GRANT READ ON __OWNER__.v_import_batches TO __APP_ROLE__;
GRANT READ ON __OWNER__.v_import_errors TO __APP_ROLE__;
GRANT EXECUTE ON __OWNER__.pkg_screening TO __APP_ROLE__;

GRANT READ ON __OWNER__.v_company_directory TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_current_report_sets TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_metric_history TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_current_metrics TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_screening_metrics TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_metric_lineage TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_report_lines TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_import_batches TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_import_errors TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_etl_batches TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_etl_errors TO __ETL_ROLE__;
GRANT READ ON __OWNER__.v_calculation_runs TO __ETL_ROLE__;
GRANT EXECUTE ON __OWNER__.pkg_etl_api TO __ETL_ROLE__;
