#!/usr/bin/env bash
# One-command database installer for Oracle AI Database 26ai Free.
#
#   tablespace + owner schema -> sql/ objects -> roles and service accounts (random
#   passwords) -> seed through the real packages -> verify 72 metrics -> optional audit
#   -> write apps/api/.env
#
# Runs SQL*Plus as SYSDBA either through `docker exec` into a running container
# (ERP_SQLPLUS=docker, default) or directly inside the Oracle container
# (ERP_SQLPLUS=local, used by docker compose on first start).
# It never modifies an existing owner schema: if the owner already exists it stops.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ERP_ROOT:-$(cd "$HERE/.." && pwd)}"
SQL_DIR="${ERP_SQL_DIR:-$ROOT/sql}"
SEED_DIR="${ERP_SEED_DIR:-$HERE/seed}"

ERP_SQLPLUS="${ERP_SQLPLUS:-docker}"
ORACLE_CONTAINER="${ORACLE_CONTAINER:-oracle-free}"
ORACLE_PDB="${ORACLE_PDB:-FREEPDB1}"
ERP_OWNER="${ERP_OWNER:-ERP_DESIGN_V1}"
ERP_APP_USER="${ERP_APP_USER:-ERP_APP}"
ERP_APP_ROLE="${ERP_APP_ROLE:-ERP_APP_READ}"
ERP_ETL_USER="${ERP_ETL_USER:-ERP_ETL}"
ERP_ETL_ROLE="${ERP_ETL_ROLE:-ERP_ETL_RUN}"
ERP_TABLESPACE="${ERP_TABLESPACE:-ERP_DATA}"
ERP_OWNER_QUOTA="${ERP_OWNER_QUOTA:-256M}"
ERP_WITH_AUDIT="${ERP_WITH_AUDIT:-auto}"            # auto | yes | no
ERP_CONNECT_STRING="${ERP_CONNECT_STRING:-127.0.0.1:1521/$ORACLE_PDB}"
ERP_ENV_FILE="${ERP_ENV_FILE:-$ROOT/apps/api/.env}"
ERP_SECRETS_FILE="${ERP_SECRETS_FILE:-$ROOT/.local/db-accounts.env}"

log() { printf '[db:install] %s\n' "$*"; }
die() { printf '[db:install] ERROR: %s\n' "$*" >&2; exit 1; }

for name in ERP_OWNER ERP_APP_USER ERP_APP_ROLE ERP_ETL_USER ERP_ETL_ROLE ERP_TABLESPACE ORACLE_PDB; do
  [[ "${!name}" =~ ^[A-Z][A-Z0-9_]{0,29}$ ]] || die "$name must be an upper-case Oracle identifier (got '${!name}')"
done
[[ "$ERP_OWNER_QUOTA" =~ ^[0-9]+[KMG]$ ]] || die "ERP_OWNER_QUOTA must look like 256M"
if [[ "$ERP_WITH_AUDIT" == auto ]]; then
  # The audit policies cover the default account names only.
  [[ "$ERP_OWNER" == ERP_DESIGN_V1 && "$ERP_APP_USER" == ERP_APP && "$ERP_ETL_USER" == ERP_ETL ]] && ERP_WITH_AUDIT=yes || ERP_WITH_AUDIT=no
fi

new_password() { printf 'Er9%s' "$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 30)"; }
APP_PW="$(new_password)"; ETL_PW="$(new_password)"; MON_PW="$(new_password)"
SECRETS=("$APP_PW" "$ETL_PW" "$MON_PW")

# Runs SQL from stdin as SYSDBA in the PDB, optionally with CURRENT_SCHEMA = owner.
run_sql() {
  local as_owner="${1:-no}" input out status
  input="$(cat)"
  local prefix=$'WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK\nWHENEVER OSERROR EXIT FAILURE\nSET DEFINE OFF\nSET ECHO OFF VERIFY OFF FEEDBACK OFF HEADING OFF PAGESIZE 0 LINESIZE 32767 TRIMSPOOL ON\n'
  prefix+="ALTER SESSION SET CONTAINER=$ORACLE_PDB;"$'\n'
  [[ "$as_owner" == owner ]] && prefix+="ALTER SESSION SET CURRENT_SCHEMA=$ERP_OWNER;"$'\n'
  prefix+=$'SET SERVEROUTPUT ON SIZE UNLIMITED\n'
  set +e
  if [[ "$ERP_SQLPLUS" == docker ]]; then
    out="$(printf '%s%s\nEXIT\n' "$prefix" "$input" | docker exec -i -e NLS_LANG=.AL32UTF8 "$ORACLE_CONTAINER" sqlplus -s / as sysdba 2>&1)"
  else
    out="$(printf '%s%s\nEXIT\n' "$prefix" "$input" | NLS_LANG=.AL32UTF8 "${ORACLE_HOME:-/opt/oracle/product/26ai/dbhomeFree}/bin/sqlplus" -s / as sysdba 2>&1)"
  fi
  status=$?
  set -e
  for s in "${SECRETS[@]}"; do out="${out//$s/[REDACTED]}"; done
  if [[ $status -ne 0 ]] || grep -qE 'ORA-[0-9]{5}|SP2-[0-9]{4}|PLS-[0-9]{5}' <<<"$out"; then
    printf '%s\n' "$out" >&2
    return 1
  fi
  printf '%s' "$out"
}

run_file() { # run_file <owner|no> <path>
  [[ -f "$2" ]] || die "missing $2"
  run_sql "$1" <"$2" >/dev/null || die "failed in $(basename "$2")"
  log "  ok $(basename "$2")"
}

scalar() { run_sql no <<<"SELECT 'V='||($1) FROM dual;" | sed -n 's/^V=//p' | head -1; }

log "target: $ORACLE_PDB, owner $ERP_OWNER, tablespace $ERP_TABLESPACE, via $ERP_SQLPLUS"
version="$(scalar "SELECT version_full FROM v\$instance")" || die "cannot connect as SYSDBA (container '$ORACLE_CONTAINER' running?)"
log "connected to Oracle $version"
[[ "$(scalar "SELECT COUNT(*) FROM dba_users WHERE username = '$ERP_OWNER'")" == 0 ]] \
  || die "owner $ERP_OWNER already exists; this installer never modifies an existing schema.
  The database is already installed: check it with 'npm run db:verify' (apps/api/.env from the first install is reused),
  or install a separate copy with other names, e.g. ERP_OWNER=ERP_COPY ERP_APP_USER=ERP_COPY_APP ... npm run db:install"
for u in "$ERP_APP_USER" "$ERP_ETL_USER" "$ERP_APP_ROLE" "$ERP_ETL_ROLE"; do
  [[ "$(scalar "SELECT COUNT(*) FROM dba_users WHERE username = '$u'")$(scalar "SELECT COUNT(*) FROM dba_roles WHERE role = '$u'")" == 00 ]] \
    || die "account or role $u already exists"
done

log "1/7 tablespace and owner schema"
run_sql no >/dev/null <<SQL || die "tablespace/owner creation failed"
DECLARE
  n NUMBER; dir VARCHAR2(500);
BEGIN
  SELECT COUNT(*) INTO n FROM dba_tablespaces WHERE tablespace_name = '$ERP_TABLESPACE';
  IF n = 0 THEN
    -- Place the datafile next to the PDB's SYSTEM datafile.
    SELECT SUBSTR(file_name, 1, INSTR(file_name, '/', -1)) INTO dir FROM dba_data_files WHERE tablespace_name = 'SYSTEM' AND ROWNUM = 1;
    EXECUTE IMMEDIATE 'CREATE TABLESPACE $ERP_TABLESPACE DATAFILE ''' || dir || LOWER('$ERP_TABLESPACE') || '01.dbf'' SIZE 32M AUTOEXTEND ON NEXT 8M MAXSIZE 512M';
  END IF;
END;
/
CREATE USER $ERP_OWNER NO AUTHENTICATION DEFAULT TABLESPACE $ERP_TABLESPACE QUOTA $ERP_OWNER_QUOTA ON $ERP_TABLESPACE;
GRANT CREATE TABLE, CREATE TRIGGER, CREATE PROCEDURE, CREATE VIEW TO $ERP_OWNER;
SQL
log "  ok owner $ERP_OWNER"

log "2/7 schema objects"
for f in 001_schema.sql 002_integrity_guards.sql 005_financial_import.sql 006_metric_calculation.sql \
         007_metric_guard_hardening.sql 008_read_views.sql 017_performance_tuning.sql 009_etl_api.sql \
         018_app_read_api.sql 019_metric_catalog.sql; do
  run_file owner "$SQL_DIR/$f"
done
errors="$(scalar "SELECT COUNT(*) FROM dba_errors WHERE owner = '$ERP_OWNER'")"
invalid="$(scalar "SELECT COUNT(*) FROM dba_objects WHERE owner = '$ERP_OWNER' AND status <> 'VALID'")"
[[ "$errors" == 0 && "$invalid" == 0 ]] || die "compilation errors: $errors, invalid objects: $invalid"
log "  ok $(scalar "SELECT COUNT(*) FROM dba_tables WHERE owner = '$ERP_OWNER'") tables, $(scalar "SELECT COUNT(*) FROM dba_views WHERE owner = '$ERP_OWNER'") views, 0 compile errors"

log "3/7 roles and service accounts"
run_sql no >/dev/null <<SQL || die "account creation failed"
CREATE ROLE $ERP_APP_ROLE NOT IDENTIFIED;
CREATE ROLE $ERP_ETL_ROLE NOT IDENTIFIED;
CREATE USER $ERP_APP_USER IDENTIFIED BY "$APP_PW" DEFAULT TABLESPACE $ERP_TABLESPACE QUOTA 0 ON $ERP_TABLESPACE;
CREATE USER $ERP_ETL_USER IDENTIFIED BY "$ETL_PW" DEFAULT TABLESPACE $ERP_TABLESPACE QUOTA 0 ON $ERP_TABLESPACE;
GRANT CREATE SESSION TO $ERP_APP_USER;
GRANT CREATE SESSION TO $ERP_ETL_USER;
GRANT $ERP_APP_ROLE TO $ERP_APP_USER;
GRANT $ERP_ETL_ROLE TO $ERP_ETL_USER;
SQL
sed -e "s/__OWNER__/$ERP_OWNER/g" -e "s/__APP_ROLE__/$ERP_APP_ROLE/g" -e "s/__ETL_ROLE__/$ERP_ETL_ROLE/g" "$SQL_DIR/010_role_grants.sql" \
  | run_sql no >/dev/null || die "grants failed"
log "  ok $ERP_APP_USER ($ERP_APP_ROLE), $ERP_ETL_USER ($ERP_ETL_ROLE)"

log "4/7 seed: 3 companies, 132 reviewed values through pkg_financial_import, 9 metric runs"
run_file owner "$SEED_DIR/pilot_seed.sql"

log "5/7 verify against the verified pilot"
verify_out="$(run_sql owner <"$SEED_DIR/verify.sql")" || die "verification failed"
grep '^OK ' <<<"$verify_out" | sed 's/^/[db:install]   /'

log "6/7 audit and monitoring"
if [[ "$ERP_WITH_AUDIT" == yes ]]; then
  if [[ "$(scalar "SELECT COUNT(*) FROM dba_users WHERE username = 'ERP_MONITOR'")" == 0 ]]; then
    run_sql no >/dev/null <<SQL || die "monitor account failed"
CREATE USER ERP_MONITOR IDENTIFIED BY "$MON_PW" DEFAULT TABLESPACE $ERP_TABLESPACE QUOTA 0 ON $ERP_TABLESPACE;
SQL
  else
    MON_PW="(unchanged existing account)"
  fi
  run_file no "$SQL_DIR/015_monitoring_role.sql"
  run_file no "$SQL_DIR/014_audit_policies.sql"
else
  MON_PW=""
  log "  skipped (ERP_WITH_AUDIT=$ERP_WITH_AUDIT)"
fi

log "7/7 write credentials"
umask 077
mkdir -p "$(dirname "$ERP_ENV_FILE")" "$(dirname "$ERP_SECRETS_FILE")"
cat >"$ERP_ENV_FILE" <<ENV
# Generated by db/install.sh. Never commit.
ORACLE_CONNECT_STRING=$ERP_CONNECT_STRING
ORACLE_USER=$ERP_APP_USER
ORACLE_SCHEMA=$ERP_OWNER
ORACLE_PASSWORD=$APP_PW
PORT=${ERP_API_PORT:-4000}
CORS_ORIGIN=${ERP_CORS_ORIGIN:-http://localhost:3000}
SWAGGER=true
ENV
cat >"$ERP_SECRETS_FILE" <<ENV
# Generated by db/install.sh. Service account passwords. Never commit.
ERP_OWNER=$ERP_OWNER
ERP_APP_USER=$ERP_APP_USER
ERP_APP_PASSWORD=$APP_PW
ERP_ETL_USER=$ERP_ETL_USER
ERP_ETL_PASSWORD=$ETL_PW
ERP_MONITOR_PASSWORD=$MON_PW
ENV
chmod 600 "$ERP_ENV_FILE" "$ERP_SECRETS_FILE"
log "  api env: $ERP_ENV_FILE ; all accounts: $ERP_SECRETS_FILE (mode 600)"
log "done"
