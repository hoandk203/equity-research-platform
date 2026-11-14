-- Run as SYSDBA inside FREEPDB1 after 020-023 on an existing installation (scripts/apply_market.py --audit).
-- ERP_DATA_CHANGE_POL enumerated the tables when it was created (sql/014); add the same five
-- actions for every project table that is not yet covered (the seven market tables and the
-- recreated daily_prices). Idempotent: only missing (object, action) pairs are added.
-- A fresh install does not need this file because 014 runs after all tables exist.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF
DECLARE
  v_sql CLOB; v_n NUMBER := 0;
BEGIN
  FOR t IN (
    SELECT t.owner, t.table_name, a.act
    FROM dba_tables t
    CROSS JOIN (SELECT column_value act FROM TABLE(sys.odcivarchar2list('INSERT','UPDATE','DELETE','LOCK','ALTER'))) a
    WHERE t.owner IN ('ERP_DESIGN_V1', 'ERP_IMPORT_TEST') AND t.table_name NOT LIKE 'MV\_%' ESCAPE '\'
      AND EXISTS (SELECT 1 FROM audit_unified_policies WHERE policy_name = 'ERP_DATA_CHANGE_POL')
      AND NOT EXISTS (SELECT 1 FROM audit_unified_policies p
                      WHERE p.policy_name = 'ERP_DATA_CHANGE_POL' AND p.object_schema = t.owner
                        AND p.object_name = t.table_name AND p.audit_option = a.act)
    ORDER BY t.owner, t.table_name, a.act
  ) LOOP
    v_sql := v_sql || CASE WHEN v_n > 0 THEN ', ' END || t.act || ' ON ' || t.owner || '.' || t.table_name;
    v_n := v_n + 1;
  END LOOP;
  IF v_n > 0 THEN
    EXECUTE IMMEDIATE 'ALTER AUDIT POLICY erp_data_change_pol ADD ACTIONS ' || v_sql;
  END IF;
  DBMS_OUTPUT.PUT_LINE('ERP_DATA_CHANGE_POL actions added: ' || v_n);
END;
/
