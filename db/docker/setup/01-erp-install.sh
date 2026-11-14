#!/bin/bash
# Sourced by the Oracle image from /opt/oracle/scripts/startup on every container start.
# The Free image ships a prebuilt database, so its one-time "setup" hook never fires;
# this startup hook installs the ERP schema, seed and accounts once and then becomes a no-op.
# The API credentials file in the erp-secrets volume marks a completed install.
# Sourced, not executed: never call `exit` here (it would stop the database container).
if [ -f /opt/erp/secrets/api.env ]; then
  echo "[db:install] already installed (/opt/erp/secrets/api.env exists), skipping"
else
  ERP_SQLPLUS=local \
  ERP_ROOT=/opt/erp \
  ERP_SQL_DIR=/opt/erp/sql \
  ERP_SEED_DIR=/opt/erp/db/seed \
  ERP_CONNECT_STRING=oracle:1521/FREEPDB1 \
  ERP_ENV_FILE=/opt/erp/secrets/api.env \
  ERP_SECRETS_FILE=/opt/erp/secrets/db-accounts.env \
    bash /opt/erp/db/install.sh \
    && chmod 644 /opt/erp/secrets/api.env   # read by the api container (non-root); accounts file stays 600
fi
