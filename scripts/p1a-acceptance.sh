#!/usr/bin/env bash
# P1A 人工验收脚本 — 一条命令跑完全部机器 gate + 逐项点选确认
#
# 用法：
#   bash scripts/p1a-acceptance.sh
#
# 它先自动跑所有机器可验证 gate（fmt/clippy/test/L0/L1/benchmark），
# 然后把每项人工确认打印出来，你只需要对每项输入 y（通过）/ n（不通过）。
# 最后把验收记录写入 evidence run 目录。
#
# 注意：本脚本只新增验收记录文件，不修改/删除任何既有证据。

set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

# ---------- 身份 ----------
BRANCH=$(git branch --show-current)
HEAD_SHA=$(git rev-parse --short HEAD)
CODE_CANDIDATE="648e9a3"   # Core 最后一次代码改动
RUN_ID="20260813-p1a-core-0967a06"
EVID_DIR="openspec/changes/refactor-lossless-live-preview/validation/evidence/P1A/$RUN_ID"
OUT_FILE="$EVID_DIR/HUMAN-ACCEPTANCE.md"
# 日志目录固定放 evidence run 下，便于排查，且脚本结束后仍可查阅
LOG_DIR="$EVID_DIR/acceptance-logs"
mkdir -p "$LOG_DIR"

echo "==========================================================="
echo "  MarkFlow P1A 人工验收"
echo "==========================================================="
echo "  分支        : $BRANCH"
echo "  当前 HEAD   : $HEAD_SHA"
echo "  code 候选   : $CODE_CANDIDATE"
echo "  evidence run: $RUN_ID"
echo ""
echo "第 1 部分：自动机器 gate（约 1-2 分钟，请等待）"
echo "-----------------------------------------------------------"

PASS_COUNT=0
FAIL_COUNT=0
declare -a GATE_LABELS=()
declare -a GATE_RESULTS=()

run_gate() {
  # 用法：run_gate <label> <log> <desc> <cmd...>
  label="$1"
  log="$2"
  desc="$3"
  shift 3
  echo -n "  [gate] $label ... "
  if "$@" > "$log" 2>&1; then
    echo "PASS"
    PASS_COUNT=$((PASS_COUNT+1))
    GATE_LABELS+=("$label")
    GATE_RESULTS+=("PASS")
  else
    echo "FAIL"
    FAIL_COUNT=$((FAIL_COUNT+1))
    GATE_LABELS+=("$label")
    GATE_RESULTS+=("FAIL")
    echo "  ! $label failed, log: $log (last 15 lines)"
    tail -15 "$log" 2>/dev/null | sed 's/^/      /'
  fi
}

# G01 fmt (markflow-core workspace manifest)
run_gate "G01 fmt" "$LOG_DIR/g01_fmt.log" "cargo fmt --manifest-path markflow-core/Cargo.toml --all -- --check" \
  cargo fmt --manifest-path markflow-core/Cargo.toml --all -- --check

# G02 clippy
run_gate "G02 clippy" "$LOG_DIR/g02_clippy.log" "cargo clippy --manifest-path markflow-core/Cargo.toml --all-targets --all-features -- -D warnings" \
  cargo clippy --manifest-path markflow-core/Cargo.toml --all-targets --all-features -- -D warnings

# G03 full test
run_gate "G03 core test" "$LOG_DIR/g03_test.log" "cargo test (markflow-core 全量)" \
  cargo test --manifest-path markflow-core/Cargo.toml

# G04 zero-patch prepare-save == original bytes (L0)
run_gate "G04 L0 fixture" "$LOG_DIR/g04_l0.log" "cargo test --manifest-path markflow-core/Cargo.toml --test fixture_l0" \
  cargo test --manifest-path markflow-core/Cargo.toml --test fixture_l0

# G05 L1 intents == oracle
run_gate "G05 L1 fixture" "$LOG_DIR/g05_l1.log" "cargo test --manifest-path markflow-core/Cargo.toml --test fixture_l1" \
  cargo test --manifest-path markflow-core/Cargo.toml --test fixture_l1

# G06 P0 canonical fixture harness 参照
run_gate "G06 byte-contract" "$LOG_DIR/g06_bytecontract.log" "npm run test:byte-contract" \
  npm run test:byte-contract

# G07 benchmark
run_gate "G07 benchmark" "$LOG_DIR/g07_bench.log" "cargo run --manifest-path markflow-core/Cargo.toml --example bench_large_inputs --release" \
  cargo run --manifest-path markflow-core/Cargo.toml --example bench_large_inputs --release

echo ""
echo "  机器 gate 汇总：$PASS_COUNT PASS / $FAIL_COUNT FAIL"
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "  ⚠  存在 FAIL —— 见上方日志。请勿继续验收，先修复。"
  exit 1
fi

# ---------- 证据展示 ----------
echo ""
echo "第 2 部分：证据展示（请打开下列文件查看）"
echo "-----------------------------------------------------------"
echo "  • 五组代表性 byte diff : $EVID_DIR/BYTE-DIFF-REPORT.md"
echo "  • 零 patch prepare-save : markflow-core/tests/fixture_l0.rs"
echo "  • L1 intents 逐字节断言 : markflow-core/tests/fixture_l1.rs"
echo "  • EOL/BOM/provenance    : markflow-core/tests/eol_provenance.rs"
echo "  • 负向/原子性/无效UTF-8 : markflow-core/tests/negative.rs"
echo "  • Reviewer 独立复核     : $EVID_DIR/REVIEW.md"
echo "  • Core API 映射         : $EVID_DIR/CORE-API-MAPPING.md"
echo ""

# ---------- 逐项人工确认 ----------
echo "第 3 部分：逐项人工确认（输入 y=通过 / n=不通过，回车继续）"
echo "-----------------------------------------------------------"

declare -a ITEMS=()
ask() {
  local key="$1"; shift
  local title="$1"; shift
  local evidence="$1"; shift
  echo ""
  echo "  [$key] $title"
  echo "        证据：$evidence"
  while true; do
    printf "        通过？ (y/n) → "
    read -r ans
    case "$ans" in
      y|Y|yes|YES) ITEMS+=("$key|PASS|$title|$evidence"); break ;;
      n|N|no|NO)   ITEMS+=("$key|FAIL|$title|$evidence"); echo "        ⚠ 已记录为不通过（验收将 FAIL）"; break ;;
      *) echo "        请输入 y 或 n" ;;
    esac
  done
}

ask "H01" "审阅 Core API 严格小于 draft 范围（无 parser/Render IR/widgets/History/DOM/Tauri）" \
  "markflow-core/src/lib.rs + markflow-core/Cargo.toml"
ask "H02" "审阅五组代表性 byte diff（LF/CRLF/Mixed/BOM/Unicode 编辑后未触及 bytes 保留）" \
  "$EVID_DIR/BYTE-DIFF-REPORT.md"
ask "H03" "确认零 patch open/prepare-save 的原始 bytes 回放（24 fixtures 全等于原始 bytes）" \
  "markflow-core/tests/fixture_l0.rs"
ask "H04" "确认 LF/CRLF/Mixed/BOM/尾部空行行为符合产品预期（含 §3.5 冻结语义）" \
  "markflow-core/tests/eol_provenance.rs"
ask "H05" "确认无效 UTF-8 只读/拒绝行为（Core 返回 invalid-encoding，不覆盖）" \
  "markflow-core/tests/negative.rs::invalid_utf8_open_refused"
ask "H06" "审阅 benchmark 可进入 P1B（50MiB open ~307ms / prepare-save ~22ms）" \
  "$LOG_DIR/g07_bench.log"
ask "H07" "签署 byte contract（未编辑保存=原始 bytes；编辑后仅意图范围改变）" \
  "design/01-byte-fidelity-and-position.md"

# ---------- 结果 ----------
echo ""
echo "==========================================================="
echo "  人工验收结果汇总"
echo "==========================================================="
HUMAN_PASS=0
HUMAN_FAIL=0
for item in "${ITEMS[@]}"; do
  IFS='|' read -r key result title evidence <<< "$item"
  if [ "$result" = "PASS" ]; then HUMAN_PASS=$((HUMAN_PASS+1)); else HUMAN_FAIL=$((HUMAN_FAIL+1)); fi
  printf "  %-4s %-4s  %s\n" "$key" "$result" "$title"
done
echo "  汇总：$HUMAN_PASS PASS / $HUMAN_FAIL FAIL"
if [ "$HUMAN_FAIL" -gt 0 ]; then
  OVERALL="FAIL（存在未通过项，需修复后重新验收）"
else
  OVERALL="PASS（机器 gate + 人工验收全部通过）"
fi
echo "  总体：$OVERALL"

# ---------- 写入验收记录 ----------
mkdir -p "$EVID_DIR"
{
  echo "# P1A 人工验收记录（由一键脚本生成）"
  echo ""
  echo "- 验收时间：$(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "- 验收人：xian（本机操作）"
  echo "- 分支：$BRANCH"
  echo "- 当前 HEAD：$HEAD_SHA"
  echo "- Core code candidate：$CODE_CANDIDATE"
  echo "- run：$RUN_ID"
  echo ""
  echo "## 机器 gate"
  echo ""
  echo "| Gate | 结果 | 命令 |"
  echo "| --- | --- | --- |"
  for i in "${!GATE_LABELS[@]}"; do
    echo "| ${GATE_LABELS[$i]} | ${GATE_RESULTS[$i]} | 见上方 |"
  done
  echo ""
  echo "## 人工确认"
  echo ""
  echo "| 项 | 结果 | 标题 | 证据 |"
  echo "| --- | --- | --- | --- |"
  for item in "${ITEMS[@]}"; do
    IFS='|' read -r key result title evidence <<< "$item"
    echo "| $key | $result | $title | $evidence |"
  done
  echo ""
  echo "## 结论"
  echo ""
  echo "- 机器 gate：$PASS_COUNT PASS / $FAIL_COUNT FAIL"
  echo "- 人工确认：$HUMAN_PASS PASS / $HUMAN_FAIL FAIL"
  echo "- 总体：$OVERALL"
} > "$OUT_FILE"

echo ""
echo "  验收记录已写入：$OUT_FILE"
echo "==========================================================="
