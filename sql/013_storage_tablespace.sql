-- Run as SYSDBA inside FREEPDB1 (scripts/apply_storage.py). Idempotent.
-- Dedicated tablespaces keep ERP data out of USERS (shared with THACSI), give each
-- schema a hard quota, and let backup/recovery target ERP data alone.
WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
SET DEFINE OFF
DECLARE
  PROCEDURE ensure(p_name VARCHAR2, p_file VARCHAR2, p_size VARCHAR2, p_max VARCHAR2) IS
    n NUMBER;
  BEGIN
    SELECT COUNT(*) INTO n FROM dba_tablespaces WHERE tablespace_name = p_name;
    IF n = 0 THEN
      EXECUTE IMMEDIATE 'CREATE TABLESPACE ' || p_name || ' DATAFILE ''' || p_file || ''' SIZE ' || p_size ||
        ' AUTOEXTEND ON NEXT 8M MAXSIZE ' || p_max ||
        ' EXTENT MANAGEMENT LOCAL SEGMENT SPACE MANAGEMENT AUTO';
    END IF;
  END;
BEGIN
  -- Application data: small, hard ceiling. Backup/restore drills target this tablespace only.
  ensure('ERP_DATA', '/opt/oracle/oradata/FREE/FREEPDB1/erp_data01.dbf', '32M', '512M');
  -- Synthetic benchmark volume is isolated so it never inflates application backups.
  ensure('ERP_PERF_DATA', '/opt/oracle/oradata/FREE/FREEPDB1/erp_perf_data01.dbf', '32M', '400M');
END;
/
ALTER USER ERP_DESIGN_V1 DEFAULT TABLESPACE ERP_DATA QUOTA 256M ON ERP_DATA;
-- Service accounts own nothing; explicit zero quotas on every ERP tablespace.
ALTER USER ERP_APP QUOTA 0 ON ERP_DATA;
ALTER USER ERP_ETL QUOTA 0 ON ERP_DATA;
