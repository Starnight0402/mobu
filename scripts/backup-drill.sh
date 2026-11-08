#!/usr/bin/env bash
# Restore drill: proves a Convex export can actually be restored.
#
#   bash scripts/backup-drill.sh <export.zip>
#
# Boots the throwaway local backend (scripts/e2e-backend.mjs, current schema),
# imports the export with --replace-all, exports it again and checks every
# table came back with the same number of documents. Fails loudly otherwise.
# Prints table names and counts only -- never document contents (CI logs on
# this repo are public).
set -euo pipefail

BACKUP="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
ROOT="$(pwd)"
CLI="node ${ROOT}/node_modules/convex/bin/main.js"
WORK="$(mktemp -d)"
export CONVEX_AGENT_MODE=anonymous

node scripts/e2e-backend.mjs > "$WORK/backend.log" 2>&1 &
BACKEND_PID=$!
cleanup() { kill "$BACKEND_PID" 2>/dev/null || true; wait "$BACKEND_PID" 2>/dev/null || true; rm -rf "$WORK"; }
trap cleanup EXIT

for _ in $(seq 1 120); do
  curl -sf http://127.0.0.1:3299 > /dev/null && break
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then cat "$WORK/backend.log"; echo "backend failed to start" >&2; exit 1; fi
  sleep 2
done
curl -sf http://127.0.0.1:3299 > /dev/null || { cat "$WORK/backend.log"; echo "backend never became ready" >&2; exit 1; }

cli() { # quiet convex CLI call in the staged backend dir; output only on failure
  local log="$WORK/cli.log" status=0
  (cd .e2e-backend && $CLI "$@") > "$log" 2>&1 || status=$?
  # Node on Windows can abort with this libuv assertion after the command has
  # finished its work (see e2e-backend.mjs). Never happens on Linux CI.
  if [[ $status -ne 0 ]] && ! grep -q UV_HANDLE_CLOSING "$log"; then
    cat "$log" >&2
    echo "convex $1 failed" >&2
    exit 1
  fi
}

cli import --replace-all -y "$BACKUP"
cli export --include-file-storage --path "$WORK/roundtrip.zip"

counts() { # <zip> -> "table count" lines, sorted
  unzip -Z1 "$1" | grep '/documents\.jsonl$' | while read -r f; do
    printf '%s %s\n' "${f%/documents.jsonl}" "$(unzip -p "$1" "$f" | grep -c . || true)"
  done | sort
}

counts "$BACKUP" > "$WORK/original.txt"
counts "$WORK/roundtrip.zip" > "$WORK/restored.txt"

echo "table documents (original → restored)"
join -a1 -e MISSING -o 0,1.2,2.2 "$WORK/original.txt" "$WORK/restored.txt" | awk '{ printf "  %-24s %8s → %s\n", $1, $2, $3 }'

# Every table in the backup must come back with the same count.
if ! join -a1 -e MISSING -o 0,1.2,2.2 "$WORK/original.txt" "$WORK/restored.txt" | awk '$2 != $3 { bad = 1 } END { exit bad }'; then
  echo "✗ Restore drill FAILED: counts differ" >&2
  exit 1
fi
total=$(awk '{ s += $2 } END { print s + 0 }' "$WORK/original.txt")
echo "✓ Restore drill passed: $(wc -l < "$WORK/original.txt") tables, ${total} documents restored"
