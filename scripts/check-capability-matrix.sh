#!/usr/bin/env bash
# Validate the phase-2 governance data under openspec/capabilities/:
#
#   matrix.json        capability/evidence matrix (schema, spec-set completeness,
#                      passed-state evidence, product-acceptance layer ladder)
#   requirements.json  umbrella task ownership (schema, unique owner, R0A mapping,
#                      full 1.1-12.10 coverage, child change dirs exist)
#   flags.json         feature flags (schema, fallback enum, expired deletion)
#   manifests/*.json   frozen benchmark/visual/IME/widget-scope/observation manifests
#
# State vocabulary is frozen to the eight levels from the phase-2 acceptance
# manual: notStarted, implemented, automatedVerified, desktopVerified,
# visualVerified, imeVerified, platformVerified, productAccepted.
#
# This script is part of `npm run validate:openspec`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CAPS_DIR="$ROOT/openspec/capabilities"
SPECS_DIR="$ROOT/openspec/specs"
CHANGES_DIR="$ROOT/openspec/changes"

ERRORS=0

fail() {
  echo "❌ $1"
  ERRORS=$((ERRORS + 1))
}

schema_validate() {
  local schema="$1" instance="$2" label="$3"
  if ! node "$ROOT/scripts/validate-schema.mjs" "$schema" "$instance"; then
    fail "$label does not conform to $(basename "$schema")"
  fi
}

# ── 1. capability matrix ────────────────────────────────────────────────
MATRIX="$CAPS_DIR/matrix.json"
MATRIX_SCHEMA="$CAPS_DIR/matrix.schema.json"

[ -f "$MATRIX" ] || { fail "$MATRIX missing"; }
[ -f "$MATRIX_SCHEMA" ] || { fail "$MATRIX_SCHEMA missing"; }
if [ -f "$MATRIX" ] && [ -f "$MATRIX_SCHEMA" ]; then
  schema_validate "$MATRIX_SCHEMA" "$MATRIX" "openspec/capabilities/matrix.json"
fi

# capability set completeness: every spec in openspec/specs must be in the matrix
if [ -f "$MATRIX" ]; then
  for dir in "$SPECS_DIR"/*/; do
    [ -f "$dir/spec.md" ] || continue
    cap="$(basename "$dir")"
    if ! jq -e --arg id "$cap" '.capabilities[] | select(.id == $id)' "$MATRIX" >/dev/null 2>&1; then
      fail "capability '$cap' exists in openspec/specs but is missing from matrix.json (run scripts/sync-capability-matrix.sh)"
    fi
  done
  echo "✓ matrix capability set matches openspec/specs"
fi

# state ladder: productAccepted requires every prior layer; each verification
# layer requires the layer before it; notStarted must clear once work begins.
STATE_LADDER="notStarted implemented automatedVerified desktopVerified visualVerified imeVerified platformVerified productAccepted"

if [ -f "$MATRIX" ]; then
  while IFS= read -r cap; do
    id="$(jq -r '.id' <<<"$cap")"
    for state in $STATE_LADDER; do
      is_true="$(jq -r --arg s "$state" '.states[$s]' <<<"$cap")"
      [ "$is_true" = "true" ] || continue
      if [ "$state" = "notStarted" ]; then
        # notStarted true is the baseline; no constraint unless something else is true
        continue
      fi
      # all states before this one must also be true
      before=1
      for earlier in $STATE_LADDER; do
        [ "$earlier" = "$state" ] && break
        if [ "$(jq -r --arg s "$earlier" '.states[$s]' <<<"$cap")" != "true" ]; then
          fail "capability '$id': state '$state' is true but required prior state '$earlier' is false"
          before=0
          break
        fi
      done
      if [ "$before" -eq 1 ] && [ "$state" != "implemented" ]; then
        # implemented is the work-start marker; notStarted must be cleared
        if [ "$(jq -r '.states.notStarted' <<<"$cap")" = "true" ]; then
          fail "capability '$id': state '$state' is true but 'notStarted' is also true"
        fi
      fi
    done
  done < <(jq -c '.capabilities[]' "$MATRIX")

  # passed state requires corresponding evidence URIs
  # (bash 3.2 has no associative arrays; use parallel indexed arrays)
  EVIDENCE_STATES="implemented automatedVerified desktopVerified visualVerified imeVerified platformVerified productAccepted"
  EVIDENCE_LAYERS=(
    "unit"
    "unit integration"
    "desktop"
    "visual"
    "ime"
    "platform"
    "unit integration desktop visual ime platform observation"
  )
  while IFS= read -r cap; do
    id="$(jq -r '.id' <<<"$cap")"
    idx=0
    for state in $EVIDENCE_STATES; do
      is_true="$(jq -r --arg s "$state" '.states[$s]' <<<"$cap")"
      if [ "$is_true" = "true" ]; then
        for layer in ${EVIDENCE_LAYERS[$idx]}; do
          count="$(jq -r --arg l "$layer" '.evidence[$l] | length' <<<"$cap")"
          if [ "$count" -eq 0 ]; then
            fail "capability '$id': state '$state' is true but evidence layer '$layer' is empty"
          fi
        done
      fi
      idx=$((idx + 1))
    done
  done < <(jq -c '.capabilities[]' "$MATRIX")
fi

# ── 2. requirements / task ownership ─────────────────────────────────────
REQS="$CAPS_DIR/requirements.json"
REQS_SCHEMA="$CAPS_DIR/requirements.schema.json"

[ -f "$REQS" ] || { fail "$REQS missing"; }
[ -f "$REQS_SCHEMA" ] || { fail "$REQS_SCHEMA missing"; }
if [ -f "$REQS" ] && [ -f "$REQS_SCHEMA" ]; then
  schema_validate "$REQS_SCHEMA" "$REQS" "openspec/capabilities/requirements.json"
fi

if [ -f "$REQS" ]; then
  # unique owner: a task ID must appear exactly once
  DUPES="$(jq -r '.tasks | group_by(.task) | map(select(length > 1)) | flatten | .[].task' "$REQS" | sort -u)"
  if [ -n "$DUPES" ]; then
    while IFS= read -r t; do fail "task '$t' has duplicate ownership in requirements.json"; done <<< "$DUPES"
  else
    echo "✓ requirements.json: every task has a unique owner"
  fi

  # R0A mapping: tasks 1.1-1.7 and 2.10 must map to r0a-baseline-governance
  R0A_MISMATCH="$(jq -r --arg change 'r0a-baseline-governance' '[.tasks[] | select((.task >= "1.1" and .task <= "1.7") or .task == "2.10") | select(.childChange != $change)] | .[].task' "$REQS")"
  if [ -n "$R0A_MISMATCH" ]; then
    while IFS= read -r t; do fail "task '$t' must map to r0a-baseline-governance"; done <<< "$R0A_MISMATCH"
  else
    echo "✓ requirements.json: tasks 1.1-1.7 and 2.10 map to r0a-baseline-governance"
  fi

  # coverage: every umbrella task 1.1-12.10 must appear
  # (build the expected list from the umbrella task IDs in the archived charter)
  ARCHIVE_TASKS="$ROOT/openspec/changes/archive/2026-07-31-typora-grade-live-preview-phase2/tasks.md"
  if [ -f "$ARCHIVE_TASKS" ]; then
    EXPECTED="$(mktemp)"
    trap 'rm -f "$EXPECTED"' EXIT
    grep -oE '[0-9]+\.[0-9]+ ' "$ARCHIVE_TASKS" | tr -d ' ' | sort > "$EXPECTED"
    HAVING="$(mktemp)"
    trap 'rm -f "$HAVING"' EXIT
    jq -r '.tasks[].task' "$REQS" | sort > "$HAVING"
    MISSING="$(comm -23 "$EXPECTED" "$HAVING")"
    if [ -n "$MISSING" ]; then
      while IFS= read -r t; do fail "task '$t' is not covered in requirements.json"; done <<< "$MISSING"
    else
      echo "✓ requirements.json: all $(wc -l < "$EXPECTED") umbrella tasks (1.1-12.10) are covered"
    fi
    rm -f "$HAVING"
  fi

  # R0A: the r0a-baseline-governance change must exist. It lives under
  # openspec/changes/ during apply and moves to openspec/changes/archive/
  # after archiving; both locations satisfy the existence check. Future child
  # changes (r0b-r5c) are not created yet, so they are NOT required to have
  # directories here; evidence honesty (check-evidence-honesty.sh) enforces
  # directory existence per claimed capability instead.
  if [ -d "$CHANGES_DIR/r0a-baseline-governance" ]; then
    echo "✓ requirements.json: r0a-baseline-governance change directory exists"
  elif compgen -G "$CHANGES_DIR/archive/*-r0a-baseline-governance" >/dev/null; then
    echo "✓ requirements.json: r0a-baseline-governance archived change directory exists"
  else
    fail "r0a-baseline-governance change directory does not exist (in changes/ or changes/archive/)"
  fi
fi

# ── 3. feature flags ─────────────────────────────────────────────────────
FLAGS="$CAPS_DIR/flags.json"
FLAGS_SCHEMA="$CAPS_DIR/flags.schema.json"

[ -f "$FLAGS" ] || { fail "$FLAGS missing"; }
[ -f "$FLAGS_SCHEMA" ] || { fail "$FLAGS_SCHEMA missing"; }
if [ -f "$FLAGS" ] && [ -f "$FLAGS_SCHEMA" ]; then
  schema_validate "$FLAGS_SCHEMA" "$FLAGS" "openspec/capabilities/flags.json"
fi

if [ -f "$FLAGS" ]; then
  # fallback is restricted to exact-source-projection (schema enum enforces it;
  # this message is belt-and-braces for a clearer error)
  BAD_FALLBACK="$(jq -r '.flags[] | select(.fallback != "exact-source-projection") | .id' "$FLAGS")"
  if [ -n "$BAD_FALLBACK" ]; then
    while IFS= read -r f; do fail "flag '$f' fallback is not exact-source-projection (serializer/DOM-save/ProseMirror rollback forbidden)"; done <<< "$BAD_FALLBACK"
  fi

  # expired flags (deleteAfter is a date in the past) must be removed
  TODAY="$(date +%Y-%m-%d)"
  EXPIRED="$(jq -r --arg today "$TODAY" '.flags[] | select(.deleteAfter | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")) | select(.deleteAfter < $today) | .id' "$FLAGS")"
  if [ -n "$EXPIRED" ]; then
    while IFS= read -r f; do fail "flag '$f' passed its deleteAfter date and must be removed"; done <<< "$EXPIRED"
  else
    echo "✓ flags.json: no expired flags; fallback values all exact-source-projection"
  fi

  # every non-null matrix flag must exist in the flag registry
  if [ -f "$MATRIX" ]; then
    MATRIX_FLAGS="$(mktemp)"
    trap 'rm -f "$MATRIX_FLAGS"' EXIT
    REGISTERED_FLAGS="$(mktemp)"
    trap 'rm -f "$REGISTERED_FLAGS"' EXIT
    jq -r '.capabilities[] | select(.flag != null) | .flag' "$MATRIX" | sort -u > "$MATRIX_FLAGS"
    jq -r '.flags[].id' "$FLAGS" | sort -u > "$REGISTERED_FLAGS"
    MISSING_FLAG="$(comm -23 "$MATRIX_FLAGS" "$REGISTERED_FLAGS")"
    if [ -n "$MISSING_FLAG" ]; then
      while IFS= read -r f; do fail "matrix references flag '$f' that is not registered in flags.json"; done <<< "$MISSING_FLAG"
    else
      echo "✓ matrix flag references all resolve to flags.json"
    fi
    rm -f "$MATRIX_FLAGS" "$REGISTERED_FLAGS"
  fi
fi

# ── 4. frozen manifests ──────────────────────────────────────────────────
MANIFESTS_DIR="$CAPS_DIR/manifests"

check_manifest_exists() {
  local name="$1"
  if [ ! -f "$MANIFESTS_DIR/$name" ]; then
    fail "manifest $MANIFESTS_DIR/$name missing (frozen by visual-release-gate spec)"
    return 1
  fi
  return 0
}

manifest_json_valid() {
  jq -e . "$1" >/dev/null 2>&1 || { fail "manifest $1 is not valid JSON"; return 1; }
  return 0
}

# benchmark
if check_manifest_exists "benchmark.manifest.json" && manifest_json_valid "$MANIFESTS_DIR/benchmark.manifest.json"; then
  REQ_FIELDS="referenceHardware referenceSoftware buildProfile fixtures measurementStart measurementEnd warmUp samples repetitions noisePolicy"
  for f in $REQ_FIELDS; do
    if ! jq -e --arg f "$f" 'has($f)' "$MANIFESTS_DIR/benchmark.manifest.json" >/dev/null 2>&1; then
      fail "benchmark.manifest.json missing required field '$f'"
    fi
  done
fi

# visual
if check_manifest_exists "visual.manifest.json" && manifest_json_valid "$MANIFESTS_DIR/visual.manifest.json"; then
  REQ_FIELDS="osImage webView fonts theme scale viewport fixtures animationState pixelThreshold changedPixelRatio masks"
  for f in $REQ_FIELDS; do
    if ! jq -e --arg f "$f" 'has($f)' "$MANIFESTS_DIR/visual.manifest.json" >/dev/null 2>&1; then
      fail "visual.manifest.json missing required field '$f'"
    fi
  done
fi

# ime
if check_manifest_exists "ime.manifest.json" && manifest_json_valid "$MANIFESTS_DIR/ime.manifest.json"; then
  for f in automated signedManual; do
    if ! jq -e --arg f "$f" 'has($f)' "$MANIFESTS_DIR/ime.manifest.json" >/dev/null 2>&1; then
      fail "ime.manifest.json missing required field '$f'"
    fi
  done
fi

# widget scope
if check_manifest_exists "widget-scope.json" && manifest_json_valid "$MANIFESTS_DIR/widget-scope.json"; then
  for f in p0 p1; do
    if ! jq -e --arg f "$f" 'has($f)' "$MANIFESTS_DIR/widget-scope.json" >/dev/null 2>&1; then
      fail "widget-scope.json missing required field '$f'"
    fi
  done
  # P0 and P1 must be disjoint
  if jq -e '([.p0[]] - [.p1[]]) | length != ([.p0[]] | length)' "$MANIFESTS_DIR/widget-scope.json" >/dev/null 2>&1; then
    fail "widget-scope.json: P0 and P1 widget lists overlap"
  fi
fi

# observation
if check_manifest_exists "observation.manifest.json" && manifest_json_valid "$MANIFESTS_DIR/observation.manifest.json"; then
  for f in releaseRevision windowDays windowHours perPlatformScenarioCount workflows logCompleteness; do
    if ! jq -e --arg f "$f" 'has($f)' "$MANIFESTS_DIR/observation.manifest.json" >/dev/null 2>&1; then
      fail "observation.manifest.json missing required field '$f'"
    fi
  done
fi

echo "✓ frozen manifests (benchmark/visual/ime/widget-scope/observation) present and valid"

# ── summary ──────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS capability matrix check(s) failed"
  exit 1
else
  echo "OK: capability matrix, task ownership, flags and manifests are consistent"
fi
