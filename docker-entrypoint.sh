#!/bin/sh
# Applies database migrations and loads puzzles (both safe to repeat), then starts the server.
set -e
npx tsx scripts/migrate.ts
npx tsx scripts/seed.ts
exec npx tsx server.ts
