#!/usr/bin/env bash
# P1B 人工验收辅助：重算 /Users/xian/markflow-test 全部 fixture 的 SHA-256 / 长度 /
# BOM / 尾部 line-break boundary 数，供与 HUMAN-ACCEPTANCE.md 基线表比对。
# 用法：bash verify-fixtures.sh
set -u
DIR=/Users/xian/markflow-test
for f in "$DIR"/*.md; do
  b=$(basename "$f")
  h=$(shasum -a 256 "$f" | awk '{print $1}')
  len=$(wc -c < "$f" | tr -d ' ')
  bom=$(head -c 3 "$f" | xxd -p)
  [ "$bom" = "efbbbf" ] && boms="BOM" || boms="noBOM"
  # 尾部 newline bytes 数（\n 或 \r，含 CRLF 整段）
  t=$(python3 -c "
import sys
d=open('$f','rb').read()
n=0; i=len(d)-1
while i>=0 and d[i] in (10,13):
    n+=1; i-=1
print(n)
")
  crlf=$(grep -c $'\r' "$f" || true)
  printf "%-42s | sha=%s | len=%-4s | %s | trailing_%s | CRLF_lines=%s\n" \
    "$b" "$h" "$len" "$boms" "$t" "$crlf"
done
