#!/usr/bin/env bash
#
# check-evidence-immutable.sh —— validation evidence「不可变性」机械护栏
#
# 规则来源：
#   VALIDATION-PROTOCOL.md:73  —— 历史 RUN / ENVIRONMENT / REVIEW 为不可变证据，
#                                 需要更正时必须新建 corrective run 并链接，不得直接改写。
#   P4B 教训（F-1 与 N-1 同类）：本仓库已有 4 次就地改写已封存 run 目录的记录，
#                                 全部发生在「只是补一句说明」的善意场景下。善意不能替代机制，
#                                 所以把规则做成可执行检查。
#
# 判定规则（逐提交，对提交 C 及其父提交 P）：
#   evidence run 目录 = <…>/validation/evidence/<PHASE>/<RUN-ID>
#
#   1. 【禁止 / EXIT=2】C 改动（M/T）或删除（D）了在 P 中已存在的 run 目录内文件。
#      —— 这是 F-1 / N-1 的违规形态，四次历史违规全部命中这一条。
#
#   2. 【新建 run 应当完整 / ⚠️ 告警，不阻断】C 新建了 P 中不存在的 run 目录时，
#      该目录在 C 中应当**同时**含 RUN.md 与 ENVIRONMENT.md。
#      —— 「环境先于 gate」是 evidence 可复现性的前提；缺 ENVIRONMENT.md 的 run
#         事后无法判断被测对象，缺 RUN.md 的 run 没有叙事。两者都应在建目录的
#         同一提交里落地，事后补会破坏该属性（且事后补会被规则 3 拦下）。
#
#      【为什么不设为阻断】本条曾拟设为 EXIT=2，实测**不满足零误报**：
#      截至 2026-08-30，全仓库 61 个 evidence run 目录中有
#        · 5 个缺 RUN.md：20260813-170525-independent-review-d74a79d、
#          20260816-p1b-human-acceptance-uncommitted-e4981e3、
#          20260818-p2-program-owner-acceptance、20260820-p3-commands、
#          20260830-122241-p4b-human-acceptance-1f1bd3c
#        · 8 个缺 ENVIRONMENT.md：上述后三者 + 20260821-p3-candidate-610f027、
#          20260821-p3-corrective-reviewer-f2f3-703ebcf、
#          20260821-p3-implementation-5.1-5.9、20260821-p3-reviewer-final-70f314c、
#          20260812-180222-planning-6bfba453
#      其中 `20260830-122241-*` 就落在当前分支的 PR 区间内，设为阻断会让 CI 当场飘红。
#      故降级为告警：新建 run 仍须补齐，但不因历史欠账阻断。
#      （若将来把历史目录补齐，可把本条提升为 EXIT=2。）
#
#   3. 【新增文件分类】C 向 P 中已存在的 run 目录**新增**（A）文件时，按文件名判定：
#
#        gates/*                                          -> ⚠️ 告警
#        REVIEW* / HUMAN-ACCEPTANCE* / REBUTTAL* / ADDENDUM* -> ✅ 放行
#        其他一切（含迟到的 RUN.md / ENVIRONMENT.md）        -> ⚠️ 告警
#
#      —— 为什么不能一律放行：协议要求 review 文档落在被审 run 目录内，而 review
#         必然晚于 run 提交，所以「任何触碰都算违规」会把协议的这一步变成必然违规
#         （N-1 正是这么发生的）。但一律放行又会让「迟到的 ENVIRONMENT.md」悄悄通过，
#         反而架空规则 2。故改为按文件名白名单放行，其余告警：不阻断，但可见。
#         （F-1 中 `7869de8` 新增 `C20-e2e-ime.log` 即属 gates/* 告警类；该提交同时
#           改了 RUN.md，故整体仍被第 1 条拦下。）
#
#   4. 【放行】新建 run 目录且满足规则 2。
#
# 用法：
#   bash scripts/check-evidence-immutable.sh                 # 暂存区 vs HEAD（提交前自查）
#   bash scripts/check-evidence-immutable.sh <base> <head>   # 提交区间（CI）
#
# 退出码：
#   0 = 通过（可能含告警）
#   2 = 发现未登记的违规（护栏拦截）
#   3 = 用法/环境错误
#
set -uo pipefail

# ---------------------------------------------------------------------------
# 已登记的历史违规（护栏建立之前发生，不回滚——回滚即第二次篡改）
#
# 新增条目必须同时写明：提交号前缀、被触碰的 run、原因、以及「为什么不回滚」。
# 这张表的存在是为了让历史可见，而不是让历史消失：命中 allowlist 时脚本仍会打印。
#
# 匹配方式用「完整 40 位哈希的前缀」而非 `git rev-parse --short`：
# 短哈希长度会随仓库对象数增长（7 -> 8），用短哈希比对会出现静默失配、CI 永久飘红。
# ---------------------------------------------------------------------------
ALLOWED_COMMITS=(
  "7869de8|083435|F-1：改写 RUN.md（状态行/gate 表/hygiene 段，+33/-16）并覆盖 8 个 gate 日志、新增 C20 日志。方向是补记缺口而非伪装通过；回滚构成第二次篡改，故登记不回滚。见 P4B.md「证据不可变性问题登记」。"
  "ec718b4|083435|向 RUN.md 追加 4 行前向指针（+4/-0）。同 F-1 目录的第二次触碰。"
  "cce1a55|080554|改写 RUN.md（+52/-1）封存该 run 为 SUPERSEDED。独立 Reviewer 判定「对象当时未正式封存（gates/ 无 .exit），可接受」，但机械上仍属就地改写，故一并登记。"
  "4ed51b9|102354|N-1：更正 F-2 时就地改写 RUN.md（+22/-3）。与 F-1 同类，由独立 Reviewer-2 发现。"
  # ---- 以下 8 条由护栏在「分支起点..HEAD」全量扫描时首次发现（2026-08-30）----
  # 全部发生在 P1A / P1B / P3 阶段，均早于护栏建立（e43e6cf），且所属阶段已关闭。
  # 不回滚——回滚即第二次篡改。登记的目的是让它们可见，而不是让它们消失。
  "8461f76|P1A/20260813-p1a-core-0967a06|「reviewer 定稿 REVIEW 指向最终候选 648e9a3 并确认 §3.5 冻结」：就地改写 REVIEW.md（+3/-3）。属「复审报告落在被审 run 目录内」这一步的固有代价。方向为把结论指向最终候选，非伪装通过。"
  "1b87220|P1B/20260814-p1b-core-bridge-06c4b0a|「P1B reviewer 复评 GO（待人工验收）记录」：改写 REVIEW.md（+15/-1）。与 F-1/N-1 同类：复评必然晚于首评，而协议要求复审报告落在被审 run 目录内。"
  "935195d|P1B/20260814-p1b-core-bridge-06c4b0a|「独立复核 P2 修复」：改写 RUN.md（+1/-1）修正测试数。更正的是记录中的数字错误。"
  "e4981e3|P1B/20260814-p1b-core-bridge-06c4b0a|「evidence manifest 重生成 + sourceSyncController 测试数对齐」：改写 RUN.md（+1/-1）对齐测试数。与上一条同类。"
  "fcba2f8|P1B/20260816-p1b-human-acceptance-uncommitted-e4981e3|「P2 单一 CodeMirror Surface 」实现提交中顺带改写 HUMAN-ACCEPTANCE.md（+3/-2）。实现提交夹带验收文档改动，属流程卫生问题。"
  "54ee16a|P1B/20260816-p1b-human-acceptance-uncommitted-e4981e3|「P2/P1B 人工验收 ACCEPTED + evidence 归档」：改写 HUMAN-ACCEPTANCE.md（+55/-49）写入验收结论。这是「人工验收报告落在被审 run 目录内」的必然形态。"
  "d308fa4|P3/20260821-p3-implementation-5.1-5.9|「更新实现证据 run 最终 gate 记录」：向 RUN.md 追加最终 gate 记录（+1/-0，纯新增）。"
)

is_allowed() {
  local full="$1"
  local entry
  for entry in ${ALLOWED_COMMITS[@]+"${ALLOWED_COMMITS[@]}"}; do
    [[ "$full" == "${entry%%|*}"* ]] && return 0
  done
  return 1
}

# 从任意 evidence 路径中抽出 run 目录：<...>/validation/evidence/<PHASE>/<RUN-ID>
extract_run_dir() {
  local p="$1"
  local prefix="${p%%/validation/evidence/*}"
  [[ "$prefix" == "$p" ]] && return 1
  local tail="${p#"$prefix"/validation/evidence/}"
  local phase="${tail%%/*}"
  local after="${tail#*/}"
  [[ "$after" == "$tail" ]] && return 1          # 只有 PHASE 一层，没有 RUN-ID
  [[ "$after" != */* ]] && return 1              # RUN-ID 后没有子路径 = 这是 PHASE 下的散文件，不是 run 目录
  local runid="${after%%/*}"
  [[ -z "$phase" || -z "$runid" ]] && return 1
  printf '%s' "${prefix}/validation/evidence/${phase}/${runid}"
}

run_dir_exists_at() {
  git cat-file -e "${1}:${2}" 2>/dev/null
}

file_exists_at() {
  git cat-file -e "${1}:${2}" 2>/dev/null
}

# 向「已存在的 run 目录」新增文件时，按文件名分类。
#   输出 "OK" 或 "WARN|<原因>"
classify_added() {
  local path="$1"
  local base="${path##*/}"
  case "$path" in
    */gates/*)
      printf 'WARN|gate 日志应在 run 执行期间产出，事后追加意味着 gate 集被扩充'
      return
      ;;
  esac
  case "$base" in
    REVIEW*|HUMAN-ACCEPTANCE*|REBUTTAL*|ADDENDUM*)
      printf 'OK'
      return
      ;;
    RUN.md|ENVIRONMENT.md)
      printf 'WARN|迟到的 %s —— 「环境先于 gate」要求它与 run 目录在同一提交落地' "$base"
      return
      ;;
    *)
      printf 'WARN|未列入放行白名单的新增文件（REVIEW*/HUMAN-ACCEPTANCE*/REBUTTAL*/ADDENDUM*）'
      return
      ;;
  esac
}

# 派生文件：不由人撰写，随目录内容机械重算，本身不构成「证据结论」。
# 把它们纳入不可变性规则会造成一类稳定误报——每往 run 目录补一个文件，
# manifest 就必须重算，于是「补文件」连带变成「改写证据」。故排除。
is_derived_file() {
  case "${1##*/}" in
    artifact-manifest.sha256) return 0 ;;
    *) return 1 ;;
  esac
}

# 取 evidence 相对后缀：<PHASE>/<RUN-ID>/<file...>
# 用途：/opsx:archive 会把整个 change 目录搬进 openspec/changes/archive/ 下，
# 且**连目录名一起改**（如 p0-lossless-byte-contract ->
# 2026-08-13-p0-lossless-byte-contract）。开 --no-renames 后它呈现为
# 「旧路径 D + 新路径 A」，纯路径归一化匹配不上，只有 evidence 相对后缀是不变的。
# 后缀相同即认定是同一次目录搬迁，而不是删除证据。
evidence_suffix() {
  local p="$1"
  local s="${p##*/validation/evidence/}"
  [[ "$s" == "$p" ]] && return 1
  printf '%s' "$s"
}

# 扫描两个快照之间的改动。
# 输出到 stdout，每行: <类别>|<label>|<run 目录>|<文件路径>|<status>|<原因>
#   类别 = VIOLATION | WARN | NEWRUN | RELOCATE | OK
scan_pair() {
  local base="$1" head="$2" label="$3"
  local status path dir verdict np
  # 本提交新增路径中的 evidence 后缀集合（且该新增位于 archive/ 下），
  # 用于识别 archive 搬迁的 D+A 配对
  local added_suffixes
  added_suffixes="$(git diff --no-renames --name-only --diff-filter=A "$base" "$head" 2>/dev/null \
    | /usr/bin/grep '/changes/archive/' \
    | /usr/bin/sed 's|^.*/validation/evidence/||')"
  while IFS=$'\t' read -r status path; do
    [[ -z "${status:-}" || -z "${path:-}" ]] && continue
    dir="$(extract_run_dir "$path")" || continue
    is_derived_file "$path" && continue
    if ! run_dir_exists_at "$base" "$dir"; then
      printf 'NEWRUN|%s|%s|%s|%s|%s\n' "$label" "$dir" "$path" "$status" "新建 run 目录"
      continue
    fi
    case "$status" in
      A*)
        verdict="$(classify_added "$path")"
        if [[ "$verdict" == OK ]]; then
          printf 'OK|%s|%s|%s|%s|%s\n' "$label" "$dir" "$path" "$status" ""
        else
          printf '%s|%s|%s|%s|%s|%s\n' "${verdict%%|*}" "$label" "$dir" "$path" "$status" "${verdict#*|}"
        fi
        ;;
      D*)
        # 删除：先排除 archive 搬迁（同一提交里在 archive/ 下新增了相同 evidence 后缀）
        if np="$(evidence_suffix "$path")" \
           && [[ -n "$added_suffixes" ]] \
           && printf '%s\n' "$added_suffixes" | /usr/bin/grep -Fxq "$np"; then
          printf 'RELOCATE|%s|%s|%s|%s|%s\n' "$label" "$dir" "$path" "$status" "archive 目录搬迁（内容随目录整体迁移，目录名亦可能变更），不计违规"
        else
          printf 'VIOLATION|%s|%s|%s|%s|%s\n' "$label" "$dir" "$path" "$status" "删除了已封存的证据文件"
        fi
        ;;
      *)
        printf 'VIOLATION|%s|%s|%s|%s|%s\n' "$label" "$dir" "$path" "$status" "改写了已封存的证据文件"
        ;;
    esac
  done < <(git diff --no-renames --name-status --diff-filter=ACDMRT "$base" "$head" 2>/dev/null)
}

usage_error() {
  echo "用法: bash scripts/check-evidence-immutable.sh [<base> <head>]" >&2
  exit 3
}

git rev-parse --git-dir >/dev/null 2>&1 || { echo "错误: 不在 git 仓库中" >&2; exit 3; }

ZERO="0000000000000000000000000000000000000000"

if [[ $# -eq 0 ]]; then
  MODE="staged"; BASE="HEAD"; HEAD_REF=""
elif [[ $# -eq 2 ]]; then
  MODE="range"; BASE="$1"; HEAD_REF="$2"
  # 首次推送分支时 GitHub 的 event.before 是全零：没有可比对的 base，跳过而不是飘红。
  if [[ "$BASE" == "$ZERO" || -z "$BASE" ]]; then
    echo "=== validation evidence 不可变性护栏 ==="
    echo "跳过：base 为空或全零（首次推送，无可比对基线）。"
    exit 0
  fi
  git cat-file -e "${BASE}^{commit}" 2>/dev/null || usage_error
  git cat-file -e "${HEAD_REF}^{commit}" 2>/dev/null || usage_error
else
  usage_error
fi

echo "=== validation evidence 不可变性护栏 ==="
echo "模式: ${MODE}"

all_tmp="$(mktemp)"
warn_tmp="$(mktemp)"
viol_tmp="$(mktemp)"
allowed_tmp="$(mktemp)"
newrun_tmp="$(mktemp)"
relocate_tmp="$(mktemp)"
trap 'rm -f "$all_tmp" "$warn_tmp" "$viol_tmp" "$allowed_tmp" "$newrun_tmp" "$relocate_tmp"' EXIT

if [[ "$MODE" == "staged" ]]; then
  while IFS=$'\t' read -r status path; do
    [[ -z "${status:-}" || -z "${path:-}" ]] && continue
    dir="$(extract_run_dir "$path")" || continue
    if ! run_dir_exists_at "HEAD" "$dir"; then
      printf 'NEWRUN|%s|%s|%s|%s|%s\n' "(暂存区)" "$dir" "$path" "$status" "新建 run 目录"
      continue
    fi
    case "$status" in
      A*)
        verdict="$(classify_added "$path")"
        if [[ "$verdict" == OK ]]; then
          printf 'OK|%s|%s|%s|%s|%s\n' "(暂存区)" "$dir" "$path" "$status" ""
        else
          printf '%s|%s|%s|%s|%s|%s\n' "${verdict%%|*}" "(暂存区)" "$dir" "$path" "$status" "${verdict#*|}"
        fi
        ;;
      *) printf 'VIOLATION|%s|%s|%s|%s|%s\n' "(暂存区)" "$dir" "$path" "$status" "改写或删除了已封存的证据文件" ;;
    esac
  done < <(git diff --cached --no-renames --name-status --diff-filter=ACDMRT) > "$all_tmp"
else
  for c in $(git rev-list --reverse "${BASE}..${HEAD_REF}"); do
    short="$(git rev-parse --short=7 "$c")"
    parent="$(git rev-parse --verify --quiet "${c}^")" || continue   # root commit 无父
    scan_pair "$parent" "$c" "$short" | /usr/bin/sed "s|^|@FULL@${c}@|"
  done > "$all_tmp.raw"
  # 把第 2 列的短哈希**替换**为完整哈希（allowlist 用完整哈希前缀匹配，
  # 避免短哈希随仓库对象数从 7 位增长到 8 位后静默失配）。
  # 注意：必须把原来的短哈希一并吃掉，否则字段数会多出一个、整体右移一位。
  /usr/bin/sed -E 's/^@FULL@([0-9a-f]+)@([A-Z]+)\|[0-9a-f]+\|/\2|\1|/' "$all_tmp.raw" > "$all_tmp"
  rm -f "$all_tmp.raw"
fi

while IFS='|' read -r kind label dir path st reason; do
  [[ -z "${kind:-}" ]] && continue
  case "$kind" in
    VIOLATION)
      if [[ "$MODE" == "range" ]] && is_allowed "$label"; then
        printf '%s|%s|%s|%s|%s|%s\n' "ALLOWED" "$label" "$dir" "$path" "$st" "$reason" >> "$allowed_tmp"
      else
        printf '%s|%s|%s|%s|%s|%s\n' "$kind" "$label" "$dir" "$path" "$st" "$reason" >> "$viol_tmp"
      fi
      ;;
    WARN)
      printf '%s|%s|%s|%s|%s|%s\n' "$kind" "$label" "$dir" "$path" "$st" "$reason" >> "$warn_tmp"
      ;;
    NEWRUN)
      printf '%s|%s|%s|%s|%s|%s\n' "$kind" "$label" "$dir" "$path" "$st" "$reason" >> "$newrun_tmp"
      ;;
    RELOCATE)
      printf '%s|%s|%s|%s|%s|%s\n' "$kind" "$label" "$dir" "$path" "$st" "$reason" >> "$relocate_tmp"
      ;;
  esac
done < "$all_tmp"

# ---------------------------------------------------------------------------
# 规则 2：新建 run 目录必须同时含 RUN.md 与 ENVIRONMENT.md
# ---------------------------------------------------------------------------
incomplete_tmp="$(mktemp)"
trap 'rm -f "$all_tmp" "$warn_tmp" "$viol_tmp" "$allowed_tmp" "$newrun_tmp" "$relocate_tmp" "$incomplete_tmp"' EXIT

if [[ -s "$newrun_tmp" ]]; then
  /usr/bin/awk -F'|' '!seen[$2"@"$3]++' "$newrun_tmp" | while IFS='|' read -r _ label dir path st reason; do
    case "$MODE" in
      range) at="$label" ;;                 # label 已是完整哈希
      *)     at="HEAD" ;;                   # 暂存区模式：文件已在索引里，但未必在 HEAD
    esac
    if [[ "$MODE" == "staged" ]]; then
      # 暂存区模式：RUN.md / ENVIRONMENT.md 可能尚未 git add，退化为检查索引+工作区
      missing=""
      for f in RUN.md ENVIRONMENT.md; do
        if ! git cat-file -e ":${dir}/${f}" 2>/dev/null && [[ ! -f "${dir}/${f}" ]]; then
          missing="${missing:+$missing, }${f}"
        fi
      done
    else
      missing=""
      for f in RUN.md ENVIRONMENT.md; do
        file_exists_at "$at" "${dir}/${f}" || missing="${missing:+$missing, }${f}"
      done
    fi
    [[ -n "$missing" ]] && printf '%s|%s|%s\n' "$label" "$dir" "$missing" >> "$incomplete_tmp"
  done
fi

status=0

if [[ -s "$allowed_tmp" ]]; then
  echo
  echo "--- 已登记的历史违规（allowlist 命中，不阻断，但保持可见）---"
  /usr/bin/awk -F'|' '!seen[$2"@"$3]++ {print $2"|"$3}' "$allowed_tmp" \
    | while IFS='|' read -r c dir; do
        for entry in ${ALLOWED_COMMITS[@]+"${ALLOWED_COMMITS[@]}"}; do
          if [[ "$c" == "${entry%%|*}"* ]]; then
            rest="${entry#*|}"; rest="${rest#*|}"
            printf '  %s -> %s\n      %s\n' "${c:0:7}" "$(basename "$dir")" "$rest"
          fi
        done
      done
fi

if [[ -s "$warn_tmp" ]]; then
  echo
  echo "--- ⚠️ 告警：向已存在的 run 目录新增了非白名单文件（不阻断）---"
  /usr/bin/awk -F'|' '!seen[$0]++' "$warn_tmp" \
    | while IFS='|' read -r _ label dir path st reason; do
        printf '  %s: %s\n      %s\n' "${label:0:7}" "${path##*/validation/evidence/}" "$reason"
      done
  echo "  放行白名单：REVIEW* / HUMAN-ACCEPTANCE* / REBUTTAL* / ADDENDUM*。"
fi

if [[ -s "$relocate_tmp" ]]; then
  echo
  echo "--- ℹ️ archive 目录搬迁（不计违规）---"
  /usr/bin/awk -F'|' '!seen[$2"@"$3]++ {print $2"|"$3}' "$relocate_tmp" \
    | while IFS='|' read -r c dir; do
        printf '  %s -> %s\n' "${c:0:7}" "${dir##*/validation/evidence/}"
      done
fi

if [[ -s "$incomplete_tmp" ]]; then
  echo
  echo "--- ⚠️ 新建 run 目录缺少必需文件（告警，不阻断）---"
  while IFS='|' read -r label dir missing; do
    printf '  %s  %s\n      缺: %s\n' "${label:0:7}" "${dir##*/validation/evidence/}" "$missing"
  done < "$incomplete_tmp"
  echo "  run 目录应在建目录的同一提交里同时含 RUN.md（叙事）与"
  echo "  ENVIRONMENT.md（被测对象与环境指纹）——「环境先于 gate」，事后补会架空该属性。"
  echo "  本条为告警而非阻断的原因见脚本头部规则 2（历史上有 5 个缺 RUN.md / 8 个缺 ENVIRONMENT.md）。"
fi

if [[ -s "$viol_tmp" ]]; then
  echo
  echo "--- ❌ 违反证据不可变性（改写或删除了已有证据文件）---" >&2
  while IFS='|' read -r _ label dir path st reason; do
    printf '  %s  [%s] %s\n           %s\n' "${label:0:7}" "${st:0:1}" "${path##*/validation/evidence/}" "$reason" >&2
  done < "$viol_tmp"
  echo >&2
  echo "  规程要求（VALIDATION-PROTOCOL.md:73）：更正历史结论必须新建 corrective run" >&2
  echo "  并在其 RUN.md 中链接到旧 run，不得就地改写或删除。" >&2
  echo "  若确属必须就地修改的例外，请连同理由加入本脚本的 ALLOWED_COMMITS。" >&2
  status=2
fi

if [[ "$status" == "0" ]]; then
  echo
  echo "✅ 未发现未登记的「改写/删除已有 evidence 证据文件」提交。（上方告警不阻断，但应处理。）"
else
  echo
  echo "❌ 护栏拦截（exit ${status}）。"
fi
exit $status
