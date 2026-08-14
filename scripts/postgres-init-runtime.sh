#!/bin/sh
set -eu

if [ -z "${POSTGRES_RUNTIME_PASSWORD:-}" ]; then
  echo "POSTGRES_RUNTIME_PASSWORD is required" >&2
  exit 1
fi

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=runtime_password="$POSTGRES_RUNTIME_PASSWORD" \
  --set=database_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE amoria_runtime LOGIN PASSWORD %L', :'runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'amoria_runtime') \gexec
SELECT format('ALTER ROLE amoria_runtime PASSWORD %L', :'runtime_password') \gexec
GRANT CONNECT ON DATABASE :"database_name" TO amoria_runtime;
GRANT USAGE ON SCHEMA public TO amoria_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO amoria_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO amoria_runtime;
SQL
