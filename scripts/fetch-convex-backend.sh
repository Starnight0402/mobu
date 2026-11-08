#!/usr/bin/env bash
# CI only (Linux x86_64). Pre-seeds the Convex CLI's download cache with the
# local backend + dashboard for the version pinned in scripts/e2e-backend.mjs.
#
# Why: `convex dev` downloads these from GitHub releases unauthenticated, and
# from shared Actions runners those requests intermittently fail (the CLI
# reports any non-200 as "File not found"). `gh release download` goes through
# the authenticated API, and we retry. When the cache is already populated
# (actions/cache), this does nothing.
set -euo pipefail

VERSION="${E2E_CONVEX_BACKEND:-$(grep -oE "precompiled-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]+" scripts/e2e-backend.mjs | head -1)}"
CACHE="${HOME}/.cache/convex"
BIN_DIR="${CACHE}/binaries/${VERSION}"
DASH_DIR="${CACHE}/dashboard"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

download() { # <asset>
  for attempt in 1 2 3 4 5; do
    if gh release download "$VERSION" --repo get-convex/convex-backend --pattern "$1" --dir "$TMP" --clobber; then
      return 0
    fi
    echo "download of $1 failed (attempt $attempt), retrying..." >&2
    sleep $((attempt * 5))
  done
  return 1
}

if [[ -x "${BIN_DIR}/convex-local-backend" ]]; then
  echo "backend ${VERSION}: cached"
else
  download convex-local-backend-x86_64-unknown-linux-gnu.zip
  mkdir -p "$BIN_DIR"
  unzip -q -o "$TMP/convex-local-backend-x86_64-unknown-linux-gnu.zip" -d "$BIN_DIR"
  chmod +x "${BIN_DIR}/convex-local-backend"
  echo "backend ${VERSION}: downloaded"
fi

if [[ -f "${DASH_DIR}/config.json" ]] && grep -q "\"${VERSION}\"" "${DASH_DIR}/config.json"; then
  echo "dashboard ${VERSION}: cached"
else
  download dashboard.zip
  rm -rf "$DASH_DIR"
  mkdir -p "${DASH_DIR}/out"
  unzip -q -o "$TMP/dashboard.zip" -d "${DASH_DIR}/out"
  printf '{"version":"%s"}' "$VERSION" > "${DASH_DIR}/config.json"
  echo "dashboard ${VERSION}: downloaded"
fi
