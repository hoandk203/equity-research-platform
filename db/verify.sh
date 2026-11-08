#!/usr/bin/env bash
# Re-runs the seed verification (counts + all 72 metric values) against an installed schema.
#   ERP_OWNER=ERP_DESIGN_V1 bash db/verify.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OWNER="${ERP_OWNER:-ERP_DESIGN_V1}"; PDB="${ORACLE_PDB:-FREEPDB1}"; CONTAINER="${ORACLE_CONTAINER:-oracle-free}"
[[ "$OWNER" =~ ^[A-Z][A-Z0-9_]{0,29}$ && "$PDB" =~ ^[A-Z][A-Z0-9_]{0,29}$ ]] || { echo "invalid ERP_OWNER/ORACLE_PDB" >&2; exit 1; }
{ printf 'WHENEVER SQLERROR EXIT SQL.SQLCODE\nSET FEEDBACK OFF HEADING OFF\nALTER SESSION SET CONTAINER=%s;\nALTER SESSION SET CURRENT_SCHEMA=%s;\n' "$PDB" "$OWNER"
  cat "$HERE/seed/verify.sql"; printf '\nEXIT\n'; } \
  | if [[ "${ERP_SQLPLUS:-docker}" == docker ]]; then docker exec -i -e NLS_LANG=.AL32UTF8 "$CONTAINER" sqlplus -s / as sysdba; else sqlplus -s / as sysdba; fi \
  | grep -E '^OK |MISMATCH|ORA-' 
