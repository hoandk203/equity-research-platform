-- Run as SYSDBA inside FREEPDB1 after the ERP_MONITOR user exists (created with a random
-- local password by scripts/check_oracle_audit.py). Read-only operational visibility:
-- sessions, locks, SQL statistics, storage and the unified audit trail. No access to ERP
-- business tables or views, no ability to change audit configuration.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF
DECLARE n NUMBER;
BEGIN
  SELECT COUNT(*) INTO n FROM dba_roles WHERE role = 'ERP_MONITOR_ROLE';
  IF n = 0 THEN EXECUTE IMMEDIATE 'CREATE ROLE erp_monitor_role NOT IDENTIFIED'; END IF;
END;
/
GRANT AUDIT_VIEWER TO erp_monitor_role;
GRANT READ ON sys.v_$session TO erp_monitor_role;
GRANT READ ON sys.v_$lock TO erp_monitor_role;
GRANT READ ON sys.v_$locked_object TO erp_monitor_role;
GRANT READ ON sys.v_$sql TO erp_monitor_role;
GRANT READ ON sys.v_$sql_plan_statistics_all TO erp_monitor_role;
GRANT READ ON sys.dba_objects TO erp_monitor_role;
GRANT READ ON sys.dba_tablespace_usage_metrics TO erp_monitor_role;
GRANT READ ON sys.dba_data_files TO erp_monitor_role;
GRANT READ ON sys.dba_segments TO erp_monitor_role;
GRANT CREATE SESSION TO ERP_MONITOR;
GRANT erp_monitor_role TO ERP_MONITOR;
