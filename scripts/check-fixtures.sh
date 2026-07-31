#!/usr/bin/env bash
# Validate the phase-2 canonical fixture manifest.
#
# 1. Validate markflow-core/fixtures/manifest.json against
#    scripts/schemas/fixture-manifest.schema.json.
# 2. Recompute sha256 for every fixture (all committed to git, including the
#    size fillers) and fail on mismatch.
#
# This script is part of `npm run validate:openspec`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$ROOT/markflow-core/fixtures/manifest.json"
SCHEMA="$ROOT/scripts/schemas/fixture-manifest.schema.json"

ERRORS=0

fail() {
  echo "❌ $1"
  ERRORS=$((ERRORS + 1))
}

# ── 1. schema validation ────────────────────────────────────────────────
if ! node "$ROOT/scripts/validate-schema.mjs" "$SCHEMA" "$MANIFEST"; then
  fail "markflow-core/fixtures/manifest.json does not conform to fixture-manifest.schema.json"
  echo ""
  echo "FAILED: fixture manifest schema validation failed"
  exit 1
fi
echo "✓ manifest.json validates against fixture-manifest.schema.json"

# ── 2. per-entry hash verification ──────────────────────────────────────
while IFS= read -r entry; do
  path="$(jq -r '.path' <<<"$entry")"
  expected="$(jq -r '.sha256' <<<"$entry")"
  full="$ROOT/$path"

  if [ ! -f "$full" ]; then
    fail "$path: fixture file missing"
    continue
  fi
  actual="$(shasum -a 256 "$full" | awk '{print $1}')"
  if [ "$actual" != "$expected" ]; then
    fail "$path: sha256 $actual != manifest $expected"
  else
    echo "✓ $path: hash matches manifest"
  fi
done < <(jq -c '.fixtures[]' "$MANIFEST")

# ── summary ─────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS fixture check(s) failed"
  exit 1
else
  echo "OK: all canonical fixture checks passed"
fi
