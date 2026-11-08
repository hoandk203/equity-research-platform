#!/bin/bash
# Run by the Oracle image (sourced) once, right after the database is created.
# Installs the ERP schema, seed and accounts, and shares the API credentials with the
# api container through the erp-secrets volume.
ERP_SQLPLUS=local \
ERP_ROOT=/opt/erp \
ERP_SQL_DIR=/opt/erp/sql \
ERP_SEED_DIR=/opt/erp/db/seed \
ERP_CONNECT_STRING=oracle:1521/FREEPDB1 \
ERP_ENV_FILE=/opt/erp/secrets/api.env \
ERP_SECRETS_FILE=/opt/erp/secrets/db-accounts.env \
  bash /opt/erp/db/install.sh \
  && chmod 644 /opt/erp/secrets/api.env   # read by the api container (non-root); accounts file stays 600
