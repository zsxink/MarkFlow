#!/usr/bin/env bash
# P6 M1 evidence gate capture. CODEBUDDY_SAFE_DELETE_ENABLED=0 lets Vite
# emptyDir(dist) and e2e temp cleanup proceed (legitimate build artifacts only).
set -u
cd /Users/xian/Project/book/MarkFlow
export CODEBUDDY_SAFE_DELETE_ENABLED=0
RUNDIR=openspec/changes/refactor-lossless-live-preview/validation/evidence/P6/20260830-173622-p6-m1-8ba0f44
mkdir -p "$RUNDIR/gates"
MANIFEST="$RUNDIR/gates/MANIFEST.txt"
: > "$MANIFEST"
run_gate() {
  local id="$1"; shift
  echo "=== $id: $* ===" > "$RUNDIR/gates/$id.log"
  "$@" >> "$RUNDIR/gates/$id.log" 2>&1
  local ec=$?
  local counts
  counts=$(grep -E "Test Files|Tests |test result|passed|passing|Spec Files|valid|Totals" "$RUNDIR/gates/$id.log" | tr '\n' '|' | head -c 400)
  printf "%-8s exit=%s | %s\n" "$id" "$ec" "$counts" >> "$MANIFEST"
  echo "-> $id exit=$ec"
}
run_gate C01 npx vitest run src/lib/lossless/projection.test.ts
run_gate C02 npm test
run_gate C03 npx tsc --noEmit
run_gate C04 cargo fmt --manifest-path markflow-core/Cargo.toml -- --check
run_gate C05 cargo clippy --manifest-path markflow-core/Cargo.toml --all-targets --all-features -- -D warnings
run_gate C06 cargo test --manifest-path markflow-core/Cargo.toml
run_gate C07 cargo test --manifest-path src-tauri/Cargo.toml
run_gate C08 npm run test:byte-contract
run_gate C09 npx openspec validate refactor-lossless-live-preview --strict
run_gate C10 npx openspec validate --all
run_gate C11 npm run build
run_gate C12 npm run test:e2e:build
run_gate C13 node e2e/run.mjs smoke
run_gate C14 node e2e/run.mjs lossless
run_gate C15 bash scripts/check-archive-synced.sh
run_gate C16 git diff --check
echo "==== MANIFEST ===="
cat "$MANIFEST"
