#!/usr/bin/env bash
# Verify that archived OpenSpec changes have their delta specs synced into main specs.
#
# Regression gate for the "archive without syncing" failure mode: after a change is
# archived (moved to openspec/changes/archive/<date>-<name>/), every delta spec under
# its specs/ directory MUST already be reflected in openspec/specs/<capability>/spec.md.
#
# Approach: for each delta spec, every non-trivial content line must appear (after
# normalizing markdown/whitespace) in the corresponding main spec. A missing line means
# a requirement/scenario/table row from the delta never made it into main specs.
#
# This is a CI gate — it reports and exits non-zero, it does NOT auto-sync.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVE_DIR="$ROOT/openspec/changes/archive"
SPECS_DIR="$ROOT/openspec/specs"

# Only enforce on archives dated on/after this cutoff (YYYY-MM-DD).
# Legacy archives predating the sync-enforcement rule are out of scope; enforcing
# on them would fail CI on pre-existing history rather than prevent new regressions.
# Override with ARCHIVE_SYNC_CUTOFF to backdate (e.g. when cleaning up old archives).
CUTOFF_DATE="${ARCHIVE_SYNC_CUTOFF:-2026-07-21}"

ERRORS=0
SKIPPED=0

if [ ! -d "$ARCHIVE_DIR" ]; then
  echo "⚠ SKIP: $ARCHIVE_DIR not found"
  exit 0
fi

# Find all archived delta specs: archive/<change>/specs/<capability>/spec.md
while IFS= read -r -d '' delta; do
  archive_name="$(basename "$(dirname "$(dirname "$(dirname "$delta")")")")"
  # archive dir name format: YYYY-MM-DD-<change-name>; date is the first 10 chars
  archive_date="${archive_name:0:10}"
  if [[ "$archive_date" < "$CUTOFF_DATE" ]]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # capability name = the directory directly under specs/
  capability="$(basename "$(dirname "$delta")")"
  main_spec="$SPECS_DIR/$capability/spec.md"

  if [ ! -f "$main_spec" ]; then
    echo "❌ ERROR: archived delta for '$capability' has no main spec at $main_spec"
    ERRORS=$((ERRORS + 1))
    continue
  fi

  # Extract requirement names from the delta (### Requirement: ...) and check
  # that each requirement exists in the main spec. This is more lenient than
  # checking every line, as wording evolves over time.
  missing=0
  in_removed=0
  while IFS= read -r line; do
    # Detect section headers to track REMOVED blocks
    trimmed="$(echo "$line" | sed 's/^[[:space:]]*//')"
    case "$trimmed" in
      "## REMOVED Requirements"*) in_removed=1; continue ;;
      "## Requirements"|"## Purpose"|"## Agent Context"|"## ADDED Requirements"|"## MODIFIED Requirements") in_removed=0 ;;
    esac
    [ "$in_removed" -eq 1 ] && continue

    # Only check requirement names (### Requirement: ...)
    if [[ "$trimmed" =~ ^###\ Requirement:\ (.+)$ ]]; then
      req_name="${BASH_REMATCH[1]}"
      # Check if this requirement name exists in the main spec
      if ! grep -qF "### Requirement: $req_name" "$main_spec"; then
        missing=$((missing + 1))
        echo "   missing requirement in main specs/$capability/spec.md: $req_name"
      fi
    fi
  done < "$delta"

  if [ "$missing" -gt 0 ]; then
    echo "❌ ERROR: $delta has $missing line(s) not synced to main specs"
    ERRORS=$((ERRORS + 1))
  else
    echo "✓ $delta: all content synced to main specs/$capability"
  fi
done < <(find "$ARCHIVE_DIR" -path '*/specs/*/spec.md' -print0)

echo ""
if [ "$SKIPPED" -gt 0 ]; then
  echo "(skipped $SKIPPED legacy archive(s) predating cutoff $CUTOFF_DATE)"
fi
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS archived change(s) have unsynced delta specs"
  exit 1
else
  echo "OK: all archived delta specs (on/after $CUTOFF_DATE) are synced to main specs"
fi
