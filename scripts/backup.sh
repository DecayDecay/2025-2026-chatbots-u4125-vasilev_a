#!/usr/bin/env bash
# Daily Postgres backup. Keeps the last 7 dumps.
# Use with Windows Task Scheduler -> "Run a program" -> bash.exe -> this file.
set -euo pipefail
DIR="$(dirname "$0")/../backups"
mkdir -p "$DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
docker exec sbox-terminal-postgres-1 \
  pg_dump -U sbox -d sbox -Fc \
  > "$DIR/sbox-$STAMP.dump"
# rotation: keep newest 7
ls -1t "$DIR"/sbox-*.dump 2>/dev/null | tail -n +8 | xargs -r rm --
echo "backup ok: $DIR/sbox-$STAMP.dump"
