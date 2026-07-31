#!/usr/bin/env bash
# Archive honesty check: rejects fabricated or stale completion evidence.
#
# Checks (per design.md Decision 4):
#   1. openspec/capabilities/matrix.json parses and conforms to its schema.
#   2. Every capability state marked true has its required evidence URIs present
#      in docs/markflow-core-phase2/evidence/INDEX.json and the referenced files
#      actually exist on disk.
#   3. Every INDEX.json evidence entry's revision equals the current git HEAD
#      (stale evidence fails); --revision <sha> overrides for development.
#   4. Every task in openspec/capabilities/requirements.json has a unique owner.
#   5. Every fixture in markflow-core/fixtures/manifest.json exists and its
#      sha256 matches the on-disk bytes.
#   6. A capability whose required gate is marked PASS carries a corresponding
#      evidence URI; a PASS with no evidence is fabricated.
#
# Run before archive. CI runs this only when a PR contains an archive directory
# (see .github/workflows/ci.yml); locally it runs by default via
# `npm run validate:openspec`. Override the revision with: --revision <sha>.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Data paths are overridable via env vars so unit tests can run the honesty
# check against temp inputs (see scripts/test-evidence-honesty.mjs).
MATRIX="${MATRIX:-$ROOT/openspec/capabilities/matrix.json}"
MATRIX_SCHEMA="${MATRIX_SCHEMA:-$ROOT/openspec/capabilities/matrix.schema.json}"
REQS="${REQS:-$ROOT/openspec/capabilities/requirements.json}"
EVIDENCE_DIR="${EVIDENCE_DIR:-$ROOT/docs/markflow-core-phase2/evidence}"
INDEX="${INDEX:-$EVIDENCE_DIR/INDEX.json}"
EVIDENCE_SCHEMA="${EVIDENCE_SCHEMA:-$EVIDENCE_DIR/evidence.schema.json}"
MANIFEST="${MANIFEST:-$ROOT/markflow-core/fixtures/manifest.json}"

ERRORS=0

fail() {
  echo "❌ $1"
  ERRORS=$((ERRORS + 1))
}

REVISION=""
if [ "${1:-}" = "--revision" ]; then
  REVISION="${2:-}"
fi
if [ -z "$REVISION" ]; then
  REVISION="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo "")"
  REVISION_SOURCE="HEAD"
else
  REVISION_SOURCE="--revision override"
fi
if [ -z "$REVISION" ]; then
  fail "cannot determine current revision; pass --revision <sha> or run inside the git checkout"
fi

echo "honesty check revision: $REVISION ($REVISION_SOURCE)"

# CI auto-skip: the design gates honesty to PRs that contain an archive change
# (HEAD drift makes the revision check flaky during normal development). When
# HONESTY_AUTO=1, run only if the diff vs HONESTY_BASE (default origin/main,
# main, or HEAD~1) touches openspec/changes/archive/. Otherwise skip with a
# message. Locally (HONESTY_AUTO unset) the full check always runs.
if [ "${HONESTY_AUTO:-0}" = "1" ]; then
  BASE="${HONESTY_BASE:-}"
  if [ -z "$BASE" ]; then
    if git -C "$ROOT" rev-parse --verify origin/main >/dev/null 2>&1; then
      BASE="origin/main"
    elif git -C "$ROOT" rev-parse --verify main >/dev/null 2>&1; then
      BASE="main"
    elif git -C "$ROOT" rev-parse --verify HEAD~1 >/dev/null 2>&1; then
      BASE="HEAD~1"
    else
      echo "SKIP: cannot determine diff base for auto honesty check"
      exit 0
    fi
  fi
  if ! git -C "$ROOT" diff --name-only "$BASE" HEAD -- openspec/changes/archive/ 2>/dev/null | grep -q .; then
    echo "SKIP: no archive change under review; honesty check runs on PRs that touch openspec/changes/archive/"
    exit 0
  fi
  echo "→ archive change present in diff vs $BASE; running full honesty check"
fi

# ── 1. matrix parses and conforms to schema ─────────────────────────────
if ! node "$ROOT/scripts/validate-schema.mjs" "$MATRIX_SCHEMA" "$MATRIX"; then
  fail "matrix.json does not conform to matrix.schema.json"
fi

# ── 2 + 6. passed states carry evidence; evidence files exist ────────────
# State -> evidence layer mapping (same as check-capability-matrix.sh).
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

# Build the set of evidence files that INDEX.json indexes: each entry's
# evidence.json plus any artifactPaths it lists.
INDEXED="$(mktemp)"
trap 'rm -f "$INDEXED"' EXIT

if [ -f "$INDEX" ]; then
  jq -r '.entries[] | .dir + "/evidence.json"' "$INDEX" 2>/dev/null | sort -u > "$INDEXED"
  jq -r '.entries[] | .dir as $d | (.artifactPaths // [])[] | $d + "/" + .' "$INDEX" 2>/dev/null | sort -u >> "$INDEXED" || true
else
  fail "$INDEX missing (evidence index must exist)"
fi

if [ -s "$INDEXED" ]; then
  while IFS= read -r rel; do
    if [ ! -f "$EVIDENCE_DIR/$rel" ]; then
      fail "INDEX.json references missing evidence file: $rel"
    else
      echo "✓ evidence file exists: $rel"
    fi
  done < "$INDEXED"
else
  fail "INDEX.json has no entries (evidence index is empty)"
fi

# Validate each existing evidence.json against the evidence schema.
while IFS= read -r rel; do
  full="$EVIDENCE_DIR/$rel"
  if [ -f "$full" ]; then
    if ! node "$ROOT/scripts/validate-schema.mjs" "$EVIDENCE_SCHEMA" "$full"; then
      fail "evidence entry does not conform to evidence.schema.json: $rel"
    fi
  fi
done < "$INDEXED"

# Every capability passed state must reference evidence present in INDEX.
if [ -f "$MATRIX" ]; then
  while IFS= read -r cap; do
    id="$(jq -r '.id' <<<"$cap")"
    idx=0
    for state in $EVIDENCE_STATES; do
      is_true="$(jq -r --arg s "$state" '.states[$s]' <<<"$cap")"
      if [ "$is_true" = "true" ]; then
        for layer in ${EVIDENCE_LAYERS[$idx]}; do
          uris="$(jq -r --arg l "$layer" '.evidence[$l][]?' <<<"$cap")"
          if [ -z "$uris" ]; then
            fail "capability '$id': state '$state' is true but evidence layer '$layer' has no URI (fabricated PASS)"
            continue
          fi
          while IFS= read -r uri; do
            if ! grep -qxF "$uri" "$INDEXED"; then
              # URI may be a repo-relative path; resolve against the repo.
              if [ -f "$ROOT/$uri" ]; then
                echo "✓ capability '$id' evidence URI exists on disk: $uri"
              else
                fail "capability '$id': state '$state' evidence URI '$uri' is not indexed in INDEX.json and does not exist on disk"
              fi
            fi
          done <<< "$uris"
        done
      fi
      idx=$((idx + 1))
    done
  done < <(jq -c '.capabilities[]' "$MATRIX")
fi

# ── 3. INDEX revision must equal current HEAD ────────────────────────────
if [ -f "$INDEX" ]; then
  STALE="$(jq -r --arg rev "$REVISION" '.entries[] | select(.revision != $rev) | .dir' "$INDEX")"
  if [ -n "$STALE" ]; then
    while IFS= read -r dir; do fail "evidence entry '$dir' revision does not match current revision $REVISION (stale evidence)"; done <<< "$STALE"
  else
    echo "✓ all INDEX.json entries carry the current revision $REVISION"
  fi
fi

# ── 4. unique task ownership ─────────────────────────────────────────────
if [ -f "$REQS" ]; then
  DUPES="$(jq -r '.tasks | group_by(.task) | map(select(length > 1)) | flatten | .[].task' "$REQS" | sort -u)"
  if [ -n "$DUPES" ]; then
    while IFS= read -r t; do fail "task '$t' has duplicate ownership in requirements.json"; done <<< "$DUPES"
  else
    echo "✓ requirements.json: every task has a unique owner"
  fi
else
  fail "$REQS missing"
fi

# ── 5. fixture manifest files exist and hashes match ─────────────────────
if [ -f "$MANIFEST" ]; then
  while IFS= read -r entry; do
    path="$(jq -r '.path' <<<"$entry")"
    expected="$(jq -r '.sha256' <<<"$entry")"
    full="$ROOT/$path"
    if [ ! -f "$full" ]; then
      fail "manifest references missing fixture: $path"
      continue
    fi
    actual="$(shasum -a 256 "$full" | awk '{print $1}')"
    if [ "$actual" != "$expected" ]; then
      fail "fixture hash mismatch: $path (got $actual, expected $expected)"
    fi
  done < <(jq -c '.fixtures[]' "$MANIFEST")
  echo "✓ markflow-core/fixtures/manifest.json: all present files match recorded hashes"
else
  fail "$MANIFEST missing (cannot verify fixture hashes)"
fi

# ── summary ──────────────────────────────────────────────────────────────
echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS honesty check(s) failed"
  exit 1
else
  echo "OK: evidence honesty checks passed for revision $REVISION"
fi
