#!/usr/bin/env bash
# Check Tauri capability files for security configuration drift.
# Called from CI to verify:
#   - main.json: no fs:allow-* permissions
#   - main.json: windows field does not contain "*" (must be bound to specific labels)
#   - tauri.conf.json: assetProtocol.scope.allow does not contain bare "**" patterns
set -euo pipefail

ERRORS=0
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── check 1: main.json has no fs:allow-* permissions ──────────────────────
MAIN="$ROOT/src-tauri/capabilities/main.json"
if [ -f "$MAIN" ]; then
  FS_PERMS=$(jq -r '.permissions[] | select(startswith("fs:"))' "$MAIN" 2>/dev/null || true)
  if [ -n "$FS_PERMS" ]; then
    echo "❌ ERROR: main.json contains fs:allow-* permissions:"
    echo "$FS_PERMS" | sed 's/^/   /'
    ERRORS=$((ERRORS + 1))
  else
    echo "✓ main.json: no fs:allow-* permissions"
  fi
else
  echo "⚠ SKIP: $MAIN not found"
fi

# ── check 2: main.json windows field must not be ["*"] ────────────────────
if [ -f "$MAIN" ]; then
  WINDOWS=$(jq -r '.windows[]?' "$MAIN" 2>/dev/null || true)
  if [ "$WINDOWS" = "*" ]; then
    echo "❌ ERROR: main.json windows field contains '*' (use explicit labels)"
    ERRORS=$((ERRORS + 1))
  else
    echo "✓ main.json: windows bound to explicit label(s)"
  fi
fi

# ── check 3: tauri.conf.json assetProtocol.scope.allow has no bare "**" ──
CONF="$ROOT/src-tauri/tauri.conf.json"
if [ -f "$CONF" ]; then
  PATTERNS=$(jq -r '.app.security.assetProtocol.scope.allow[]?' "$CONF" 2>/dev/null || true)
  if echo "$PATTERNS" | grep -q '^\*\*'; then
    echo "❌ ERROR: tauri.conf.json assetProtocol.scope.allow contains bare '**' pattern:"
    echo "$PATTERNS" | grep '^\*\*' | sed 's/^/   /'
    ERRORS=$((ERRORS + 1))
  else
    echo "✓ tauri.conf.json: asset scope has no bare global patterns"
  fi
fi

# ── summary ──────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS check(s) failed"
  exit 1
else
  echo "OK: all capability checks passed"
fi
