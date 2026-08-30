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
#   2. 【告警 / 不阻断】C 向 P 中已存在的 run 目录**新增**（A）了 `gates/*` 文件。
#      —— gate 日志应当在 run 执行期间产出，事后追加意味着 gate 集被扩充。
#         （F-1 中 `7869de8` 新增 `C20-e2e-ime.log` 即属此类；该提交同时改了 RUN.md，
#           故整体仍被第 1 条拦下，此告警用于兜住「只加不改」的情形。）
#
#   3. 【放行】向 run 目录新增非 gate 文件（如 REVIEW.md 复审报告）。
#      —— 协议要求 review 文档落在被审 run 目录内，而 review 必然晚于 run 提交。
#         「任何触碰都算违规」会把协议的这一步变成必然违规（N-1 正是这么发生的），
#         因此放行新增。原始结论文件未被改动，git 历史完整可查。
#
#   4. 【放行】新建 run 目录（P 中不存在）。
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
# 新增条目必须同时写明：提交号、被触碰的 run、原因、以及「为什么不回滚」。
# 这张表的存在是为了让历史可见，而不是让历史消失：命中 allowlist 时脚本仍会打印。
# ---------------------------------------------------------------------------
ALLOWED_COMMITS=(
  "7869de8|083435|F-1：改写 RUN.md（状态行/gate 表/hygiene 段，+33/-16）并覆盖 8 个 gate 日志、新增 C20 日志。方向是补记缺口而非伪装通过；回滚构成第二次篡改，故登记不回滚。见 P4B.md「证据不可变性问题登记」。"
  "ec718b4|083435|向 RUN.md 追加 4 行前向指针（+4/-0）。同 F-1 目录的第二次触碰。"
  "cce1a55|080554|改写 RUN.md（+52/-1）封存该 run 为 SUPERSEDED。独立 Reviewer 判定「对象当时未正式封存（gates/ 无 .exit），可接受」，但机械上仍属就地改写，故一并登记。"
  "4ed51b9|102354|N-1：更正 F-2 时就地改写 RUN.md（+22/-3）。与 F-1 同类，由独立 Reviewer-2 发现。"
)

is_allowed() {
  local short="$1"
  local entry
  for entry in ${ALLOWED_COMMITS[@]+"${ALLOWED_COMMITS[@]}"}; do
    [[ "${entry%%|*}" == "$short" ]] && return 0
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
  local runid="${after%%/*}"
  [[ -z "$phase" || -z "$runid" ]] && return 1
  printf '%s' "${prefix}/validation/evidence/${phase}/${runid}"
}

run_dir_exists_at() {
  git cat-file -e "${1}:${2}" 2>/dev/null
}

# 扫描两个快照之间的改动。
# 用法: scan_pair <base> <head> <label> <允许新增 gate 时是否告警: yes|no>
# 输出到 stdout，每行: <类别>|<label>|<run 目录>|<文件路径>|<status>
#   类别 = VIOLATION | WARN | OK
scan_pair() {
  local base="$1" head="$2" label="$3"
  local status path dir
  while IFS=$'\t' read -r status path; do
    [[ -z "${status:-}" || -z "${path:-}" ]] && continue
    dir="$(extract_run_dir "$path")" || continue
    run_dir_exists_at "$base" "$dir" || continue      # 新建 run，放行
    case "$status" in
      A*)
        # 新增文件：gate 日志告警，其余放行
        if [[ "$path" == */gates/* ]]; then
          printf 'WARN|%s|%s|%s|%s\n' "$label" "$dir" "$path" "$status"
        else
          printf 'OK|%s|%s|%s|%s\n' "$label" "$dir" "$path" "$status"
        fi
        ;;
      *)
        printf 'VIOLATION|%s|%s|%s|%s\n' "$label" "$dir" "$path" "$status"
        ;;
    esac
  done < <(git diff --no-renames --name-status --diff-filter=ACDMRT "$base" "$head" 2>/dev/null)
}

usage_error() {
  echo "用法: bash scripts/check-evidence-immutable.sh [<base> <head>]" >&2
  exit 3
}

git rev-parse --git-dir >/dev/null 2>&1 || { echo "错误: 不在 git 仓库中" >&2; exit 3; }

if [[ $# -eq 0 ]]; then
  MODE="staged"; BASE="HEAD"; HEAD=""
elif [[ $# -eq 2 ]]; then
  MODE="range"; BASE="$1"; HEAD="$2"
  git cat-file -e "${BASE}^{commit}" 2>/dev/null || usage_error
  git cat-file -e "${HEAD}^{commit}" 2>/dev/null || usage_error
else
  usage_error
fi

echo "=== validation evidence 不可变性护栏 ==="
echo "模式: ${MODE}"

all_tmp="$(mktemp)"
warn_tmp="$(mktemp)"
viol_tmp="$(mktemp)"
allowed_tmp="$(mktemp)"
trap 'rm -f "$all_tmp" "$warn_tmp" "$viol_tmp" "$allowed_tmp"' EXIT

if [[ "$MODE" == "staged" ]]; then
  # 暂存区模式：把 git diff --cached 的输出喂给与 scan_pair 相同的判定逻辑
  while IFS=$'\t' read -r status path; do
    [[ -z "${status:-}" || -z "${path:-}" ]] && continue
    dir="$(extract_run_dir "$path")" || continue
    run_dir_exists_at "HEAD" "$dir" || continue
    case "$status" in
      A*) [[ "$path" == */gates/* ]] \
            && printf 'WARN|%s|%s|%s|%s\n' "(暂存区)" "$dir" "$path" "$status" \
            || printf 'OK|%s|%s|%s|%s\n' "(暂存区)" "$dir" "$path" "$status" ;;
      *)   printf 'VIOLATION|%s|%s|%s|%s\n' "(暂存区)" "$dir" "$path" "$status" ;;
    esac
  done < <(git diff --cached --no-renames --name-status --diff-filter=ACDMRT) > "$all_tmp"
else
  for c in $(git rev-list --reverse "${BASE}..${HEAD}"); do
    short="$(git rev-parse --short "$c")"
    parent="$(git rev-parse --verify --quiet "${c}^")" || continue   # root commit 无父
    scan_pair "$parent" "$c" "$short"
  done > "$all_tmp"
fi

while IFS='|' read -r kind label dir path status; do
  [[ -z "${kind:-}" ]] && continue
  case "$kind" in
    VIOLATION)
      if [[ "$MODE" == "range" ]] && is_allowed "$label"; then
        printf '%s|%s|%s|%s|%s\n' "ALLOWED" "$label" "$dir" "$path" "$status" >> "$allowed_tmp"
      else
        printf '%s|%s|%s|%s|%s\n' "$kind" "$label" "$dir" "$path" "$status" >> "$viol_tmp"
      fi
      ;;
    WARN)
      printf '%s|%s|%s|%s|%s\n' "$kind" "$label" "$dir" "$path" "$status" >> "$warn_tmp"
      ;;
  esac
done < "$all_tmp"

status=0

if [[ -s "$allowed_tmp" ]]; then
  echo
  echo "--- 已登记的历史违规（allowlist 命中，不阻断，但保持可见）---"
  # 同一提交可能改多个文件，按 提交+run 去重后每个提交只报一条
  /usr/bin/awk -F'|' '!seen[$2"@"$3]++ {print $2"|"$3}' "$allowed_tmp" \
    | while IFS='|' read -r c dir; do
        for entry in ${ALLOWED_COMMITS[@]+"${ALLOWED_COMMITS[@]}"}; do
          if [[ "${entry%%|*}" == "$c" ]]; then
            rest="${entry#*|}"; rest="${rest#*|}"    # 去掉 <run> 字段，只留原因
            printf '  %s -> %s\n      %s\n' "$c" "$(basename "$dir")" "$rest"
          fi
        done
      done
fi

if [[ -s "$warn_tmp" ]]; then
  echo
  echo "--- ⚠️ 告警：向已存在的 run 追加了 gate 日志（不阻断）---"
  /usr/bin/awk -F'|' '!seen[$0]++' "$warn_tmp" \
    | while IFS='|' read -r _ label dir path st; do
        printf '  %s: %s\n' "$label" "${path##*/validation/evidence/}"
      done
  echo "  gate 日志应在 run 执行期间产出；事后追加意味着该 run 的 gate 集被扩充。"
fi

if [[ -s "$viol_tmp" ]]; then
  echo
  echo "--- ❌ 违反证据不可变性（改写或删除了已有证据文件）---" >&2
  while IFS='|' read -r _ label dir path st; do
    printf '  %s  [%s] %s\n' "$label" "${st:0:1}" "${path##*/validation/evidence/}" >&2
  done < "$viol_tmp"
  echo >&2
  echo "  规程要求（VALIDATION-PROTOCOL.md:73）：更正历史结论必须新建 corrective run" >&2
  echo "  并在其 RUN.md 中链接到旧 run，不得就地改写或删除。" >&2
  echo "  若确属必须就地修改的例外，请连同理由加入本脚本的 ALLOWED_COMMITS。" >&2
  status=2
fi

if [[ "$status" == "0" ]]; then
  echo
  echo "✅ 未发现改写/删除已有 evidence 证据文件的提交。"
else
  echo
  echo "❌ 护栏拦截（exit ${status}）。"
fi
exit $status
