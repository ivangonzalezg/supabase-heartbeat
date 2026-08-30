#!/bin/sh
set -e

echo "[docker-entrypoint] Applying database migrations..."
npx --no-install drizzle-kit migrate

echo "[docker-entrypoint] Starting application..."
exec node dist/main
