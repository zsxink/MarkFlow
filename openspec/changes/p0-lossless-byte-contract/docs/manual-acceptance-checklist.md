# P0 人工验收清单（handoff）

> 人工验收人执行。AI 已停止，不代替点击。候选 commit：`aba52cc`
> （branch `test/issue-255-lossless-byte-contract`）；flags：legacy baseline
> （无 lossless flags，默认 ProseMirror 路径）。
>
> 对应设计：umbrella `design/phases/P0-baseline-contract.md` §6 人工验证。
> 验收结果写入 umbrella `validation/phases/P0.md`「人工验证记录」或本目录的验收记录。

## 目的

在真实桌面应用上确认：当前 ProseMirror 路径在「编辑正文一个字符后保存」会丢失
/改写文末换行字节 —— 这正是 P0 AI gate 已在字节级证明的失败。人工验收用于确认
报告准确、UI 行为与 byte diff 一致，且没有把失败误标为已修复。

## 准备

1. 从 `tests/fixtures/byte-contract/fixtures/` 复制 4 个 fixture 到隔离工作目录
   （**不要**修改 `tests/fixtures/...` 原件）：
   - `utf8-lf-tail2.md`（LF，2 个尾部边界）
   - `utf8-lf-tail3.md`（LF，3 个尾部边界）
   - `utf8-crlf-tail2.md`（CRLF，2 个尾部边界）
   - `utf8-crlf-tail3.md`（CRLF，3 个尾部边界）
   - 建议：把副本另存为新名（如 `manual-tail2-lf.md`），避免与原件混淆。
2. 记录每个副本的 SHA-256：
   `shasum -a 256 <副本路径>`
3. 启动应用：`npm run tauri dev`（或已构建的 debug 版本）。

## 操作步骤（每个 fixture 各一次）

| # | 操作 | 观察点 | 记录 |
| --- | --- | --- | --- |
| 1 | 打开副本 | 不编辑，观察状态栏是否出现 dirty / autosave 是否写盘 / 文件 mtime 是否变化 | 结果 |
| 2 | 在正文中间改一个字符（如 `Body` → `BodyX`）并保存 | 记录保存后的文件 hash：`shasum -a 256 <副本>` | 结果 |
| 3 | 用十六进制工具或 `xxd <副本> | tail` 看文件末尾字节 | 记录尾部实际字节（LF 应为 `0a 0a` 或 `0a 0a 0a`；CRLF 应为 `0d 0a 0d 0a` 等） | 结果 |
| 4 | 重开文件 | 确认 UI 表现与第 3 步 byte diff 一致 | 结果 |
| 5 | 对 LF 与 CRLF fixture 各执行一次 | 同上 | 结果 |

## 判定要点

- **区分术语**：报告/记录中「尾部换行边界数」按行尾换行边界计（`\r\n\r\n` = 2），
  「正文后的视觉空白行数」是渲染表现，两者不得混用。
- **预期失败**：按 AI gate 证据，正文编辑后 CRLF 副本的尾部会变成 LF 且边界数
  减少（2→1），CR 副本尾部丢失。若人工观察**没有**发现失败，请记录并与 byte diff
  对照查因（可能是我报告的复现场景与你的操作路径不同），不要直接把 AI 结论标成
  「已修复」。
- **不误标已修复**：AI 报告应如实描述当前失败，不得描述成已修复；请核对本清单
  附带的 evidence（`validation/evidence/P0/20260812-192707-p0-baseline/RUN.md`）。

## 辅助验证脚本

```bash
# 比较「打开时」与「保存后」的字节是否一致（L0 判定）
node tests/byte-contract/l0-harness.mjs <输入副本> <保存后的文件>
# 若输出 pass:false 并给出 byteDiffCount，说明保存改写/丢失了字节
```

## 结论记录

- 验收人：____
- 日期/设备/OS：____
- 使用 fixture 与 hash：____
- 结论：Accept / Accept with recorded risk / Reject
- 阻塞 issue 编号：____

（人工 `Accept with recorded risk` 不能覆盖 byte fidelity / 错误写盘 / 安全 /
跨文档污染问题；这四类只能 Reject。）
