# P0：现状基线与 Byte 合同

## 1. 目标

不改变默认产品行为，建立能稳定证明当前 ProseMirror 路径损坏尾部空行的测试、canonical fixtures、L0/L1 判定器、环境基线和关键 ADR。

## 2. 输入与依赖

- 基线 `feat-v0.1.0@6bfba453` 与 P0 child branch；
- 当前 #189 实现和失败文档；
- `design/01-byte-fidelity-and-position.md`；
- 当前 unit、Rust、build、E2E 基线；
- [P0 验证记录](../../validation/phases/P0.md)。

## 3. 实施范围

1. 建立二进制 fixtures 与 manifest；
2. 建立 SHA-256、byte diff、surviving interval L1 harness；
3. 增加当前 PM 打开→编辑正文→保存→重开的失败回归；
4. 记录现有调用图、flags、日志和测试环境；
5. 冻结 encoding、EOL inheritance、PositionMap、file identity、Save As ADR；
6. 建立真实 Tauri dispatcher contract harness 的最小骨架；
7. 固定 SHA 保存 Muya/Vditor 行为矩阵，并对指定 ChatGPT Desktop 版本建立明确标注证据等级的黑盒观察矩阵；
8. 不引入 Core session，不切换编辑器。

## 4. AI Coding 验证

AI 必须：

- 运行 `git status --short --branch` 和 `git rev-parse HEAD`；
- 运行 `npm test`；
- 运行 `npx tsc --noEmit`；
- 运行 `npm run build`；
- 运行 `cargo test --manifest-path src-tauri/Cargo.toml`；
- 运行 `npm run test:e2e`；
- 对每个 fixture 执行 L0 hash；
- 对预定义 edit intent 执行 L1 interval 比较；
- 证明 PM 回归测试在修复前按预期失败，且 failure 是尾部 bytes 差异；
- 检查 harness 自身 negative controls：故意改一个未触及 byte 时必须失败；
- 检查 Patch DTO 可表达显式 paste EOL、普通 inherit 顺序唯一，identity matrix 不会因保存拒绝合法 N+1 patch；
- 检查 guarded-write ADR 明确平台 CAS capability、替换点复核、recovery 和 outcome reconcile；
- 保存 Muya/Vditor 固定 SHA 与 ChatGPT Desktop Observed/Official/Inference 黑盒矩阵；
- 将命令、退出码、hash、diff JSON 和日志写入 P0 验证记录。

AI 不得把“预期失败”的 PM test 混入长期红色默认 suite；应使用明确 baseline characterization 或保存 failure artifact，并在 child change 中说明运行方式。

## 5. 独立 Reviewer 验证

Reviewer 必须独立检查 fixture manifest、2/3-boundary 术语、L0/L1 positive/negative controls、PM 失败复现，以及 encoding/EOL provenance/identity matrix/guarded-write ADR。Reviewer 至少重跑一组 LF、一组 CRLF/Mixed、一组 Unicode 和一次故意损坏未触及 byte 的 negative control。任一数据合同仍冲突或 harness 不能抓住故意损坏时拒绝 P0 Go。

## 6. 人工验证

人工验收人在当前应用中：

1. 分别打开结尾含 2 个 line-break boundaries，以及结尾含 3 个 boundaries（正文后两个视觉空白行）的复制 fixtures；
2. 不编辑，观察是否出现 dirty/mtime 变化；
3. 只修改正文中间一个字符并保存；
4. 使用十六进制工具或验证脚本确认尾部 boundary 数量与 EOL 类型是否丢失；
5. 重开确认 UI 表现；
6. 对 LF 与 CRLF fixture 各执行一次；
7. 确认报告区分“尾部换行边界数”和“正文后的视觉空白行数”；
8. 确认 AI 报告准确描述当前失败，不把它误标成已修复；
9. 审阅 ADR 中新增换行的继承规则和无效 UTF-8 行为。

## 7. 必须证据

- environment manifest；
- fixtures manifest 与 SHA-256；
- PM failure 的 input/output bytes diff；
- L0/L1 harness positive/negative 输出；
- unit/build/Rust/E2E 原始日志；
- 人工操作记录与文件 hash；
- ADR reviewer 签字。
- 独立 Reviewer 报告与关键命令原始输出。
- 开源行为矩阵与 ChatGPT Desktop 公开证据边界记录。

## 8. Go/No-Go

Go：失败可稳定复现；harness 能抓住真实和故意损坏；ADR 无未决数据安全问题；现有基线测试结果已记录。

No-Go：只能通过字符串 trim 比较；CRLF/Mixed/Unicode 无 fixture；失败不能稳定复现；人工与 AI 观察不一致且未查明。

## 9. 回滚

P0 只增加测试、fixtures 与文档。回滚为关闭或撤销 P0 child change，不影响产品 runtime。fixtures/harness 应保留供后续阶段使用。
