-- Run as SYSDBA inside FREEPDB1 (scripts/check_oracle_audit.py). Idempotent: existing
-- policies are kept. Unified audit is separate from business_change_log: the audit trail
-- records who did what at database level (including SYS and denied attempts); the business
-- log records domain state transitions written by the packages.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF
DECLARE
  v_sql CLOB;
  v_n NUMBER;
  FUNCTION policy_exists(p VARCHAR2) RETURN BOOLEAN IS
    n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO n FROM audit_unified_policies WHERE policy_name = p;
    RETURN n > 0;
  END;
BEGIN
  -- 1. Any change to ERP base tables, by anyone (SYS, owner via packages, ETL via facade).
  --    LOCK and ALTER cover explicit table locks and structural changes on the same objects.
  IF NOT policy_exists('ERP_DATA_CHANGE_POL') THEN
    v_sql := 'CREATE AUDIT POLICY erp_data_change_pol ACTIONS ';
    v_n := 0;
    FOR t IN (SELECT owner, table_name FROM dba_tables
              WHERE owner IN ('ERP_DESIGN_V1', 'ERP_IMPORT_TEST') ORDER BY owner, table_name) LOOP
      FOR a IN (SELECT column_value act FROM TABLE(sys.odcivarchar2list('INSERT','UPDATE','DELETE','LOCK','ALTER'))) LOOP
        v_sql := v_sql || CASE WHEN v_n > 0 THEN ', ' END || a.act || ' ON ' || t.owner || '.' || t.table_name;
        v_n := v_n + 1;
      END LOOP;
    END LOOP;
    EXECUTE IMMEDIATE v_sql;
  END IF;

  -- 2. Every call into the ETL facade.
  IF NOT policy_exists('ERP_ETL_API_POL') THEN
    EXECUTE IMMEDIATE 'CREATE AUDIT POLICY erp_etl_api_pol ACTIONS EXECUTE ON ERP_DESIGN_V1.PKG_ETL_API, EXECUTE ON ERP_IMPORT_TEST.PKG_ETL_API';
  END IF;

  -- 3. Successful and failed sessions of service accounts (built-in policy logs failures only).
  IF NOT policy_exists('ERP_SESSION_POL') THEN
    EXECUTE IMMEDIATE 'CREATE AUDIT POLICY erp_session_pol ACTIONS LOGON, LOGOFF';
  END IF;

  -- 4. Anything a service account tries and is refused (privilege boundary probing).
  IF NOT policy_exists('ERP_SERVICE_DENIED_POL') THEN
    EXECUTE IMMEDIATE 'CREATE AUDIT POLICY erp_service_denied_pol ACTIONS ALL';
  END IF;
END;
/
AUDIT POLICY erp_data_change_pol;
AUDIT POLICY erp_etl_api_pol;
AUDIT POLICY erp_session_pol BY ERP_APP, ERP_ETL, ERP_MONITOR, ERP_TEST_APP, ERP_TEST_ETL;
AUDIT POLICY erp_service_denied_pol BY ERP_APP, ERP_ETL, ERP_MONITOR, ERP_TEST_APP, ERP_TEST_ETL WHENEVER NOT SUCCESSFUL;
