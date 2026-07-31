#!/usr/bin/env bash
# (Re)generate openspec/capabilities/matrix.json from the set of capability
# specs in openspec/specs/ (one capability per directory containing spec.md).
#
# Each generated capability starts in the notStarted state with empty evidence;
# existing entries in the matrix that are still present in specs are preserved
# (states and evidence are carried forward so edits to the checked-in matrix are
# not lost on a re-sync). Entries whose capability spec has been removed from
# openspec/specs/ are dropped.
#
# The capability set is the source of truth for the matrix: check-capability-matrix.sh
# fails if a spec capability is missing from matrix.json, so a newly added spec
# surfaces as a diff that requires this script to be re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPECS_DIR="$ROOT/openspec/specs"
OUT="$ROOT/openspec/capabilities/matrix.json"

# Build the capability list as JSON lines. Existing matrix entries whose id is
# still present in openspec/specs are carried forward verbatim; brand-new specs
# get a fresh notStarted entry.
LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT

for dir in "$SPECS_DIR"/*/; do
  spec="$dir/spec.md"
  [ -f "$spec" ] || continue
  id="$(basename "$dir")"

  if [ -f "$OUT" ] && jq -e --arg id "$id" '.capabilities[] | select(.id == $id)' "$OUT" >/dev/null 2>&1; then
    jq -c --arg id "$id" '.capabilities[] | select(.id == $id)' "$OUT" >> "$LIST"
  else
    jq -c -n --arg id "$id" '{
      id: $id,
      owner: "@xian",
      childChange: "r0a-baseline-governance",
      flag: null,
      default: false,
      states: {
        notStarted: true,
        implemented: false,
        automatedVerified: false,
        desktopVerified: false,
        visualVerified: false,
        imeVerified: false,
        platformVerified: false,
        productAccepted: false
      },
      evidence: {
        unit: [],
        integration: [],
        desktop: [],
        visual: [],
        ime: [],
        platform: [],
        observation: []
      }
    }' >> "$LIST"
  fi
done

jq -n --slurpfile caps "$LIST" '{
  schemaVersion: 1,
  capabilities: $caps
}' > "$OUT"

echo "synced capability matrix to $OUT ($(jq '.capabilities | length' "$OUT") capabilities)"
