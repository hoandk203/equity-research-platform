#!/usr/bin/env bash
# Copies the credentials written by the Docker Compose install out of the erp-secrets volume,
# so the API and ETL can run on the host (npm run start:api / etl:load) against the Compose Oracle.
#   npm run db:env            # writes apps/api/.env and .local/db-accounts.env
#   FORCE=1 npm run db:env    # overwrite existing files
# The connect string is rewritten from the in-network host (oracle:1521) to localhost:$ORACLE_PORT.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

die() { printf '[db:env] ERROR: %s\n' "$*" >&2; exit 1; }

ORACLE_PORT="$(sed -n 's/^ORACLE_PORT=//p' .env 2>/dev/null | tail -1)"
ORACLE_PORT="${ORACLE_PORT:-1521}"
[[ "$ORACLE_PORT" =~ ^[0-9]+$ ]] || die "ORACLE_PORT in .env must be a number"
WEB_DEV_ORIGIN="${WEB_DEV_ORIGIN:-http://localhost:3000}"
API_ENV="${ERP_API_ENV_OUT:-apps/api/.env}"; ACCOUNTS="${ERP_ACCOUNTS_OUT:-.local/db-accounts.env}"

docker compose exec -T oracle test -f /opt/erp/secrets/api.env 2>/dev/null \
  || die "no credentials in the Compose volume yet: run 'docker compose up -d oracle' and wait for '[db:install] done' in 'docker compose logs -f oracle'"

if [[ "${FORCE:-}" != 1 ]]; then
  for f in "$API_ENV" "$ACCOUNTS"; do
    [[ -e "$f" ]] && die "$f already exists (maybe from another database). Re-run with FORCE=1 to overwrite it."
  done
fi

umask 077
mkdir -p "$(dirname "$ACCOUNTS")"
docker compose exec -T oracle cat /opt/erp/secrets/api.env \
  | sed -e "s#^ORACLE_CONNECT_STRING=.*#ORACLE_CONNECT_STRING=localhost:${ORACLE_PORT}/FREEPDB1#" \
        -e "s#^CORS_ORIGIN=.*#CORS_ORIGIN=${WEB_DEV_ORIGIN}#" >"$API_ENV"
{ docker compose exec -T oracle cat /opt/erp/secrets/db-accounts.env
  printf 'ORACLE_CONNECT_STRING=localhost:%s/FREEPDB1\n' "$ORACLE_PORT"; } >"$ACCOUNTS"
chmod 600 "$API_ENV" "$ACCOUNTS"
printf '[db:env] wrote %s and %s (Oracle at localhost:%s/FREEPDB1)\n' "$API_ENV" "$ACCOUNTS" "$ORACLE_PORT"
