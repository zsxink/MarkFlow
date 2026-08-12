# P0：现状基线与 Byte 合同

## 1. 目标

不改变默认产品行为，建立能稳定证明当前 ProseMirror 路径损坏未触及 bytes 的测试、canonical fixtures、L0/L1 判定器、环境基线和关键 ADR。P0 必须同时刻画 serializer 级“编辑后损坏”和真实产品生命周期“零编辑打开即 dirty/autosave 写盘”，但不负责修复 legacy runtime。

## 2. 输入与依赖

- 基线 `feat-v0.1.0@6bfba453` 与 P0 child branch；
- 当前 #189 实现和失败文档；
- `design/01-byte-fidelity-and-position.md`；
- 当前 unit、Rust、build、E2E 基线；
- [P0 验证记录](../../validation/phases/P0.md)。

## 3. 实施范围

1. 建立二进制 fixtures 与 manifest；
2. 建立 SHA-256、byte diff、surviving interval L1 harness；
3. 增加当前 PM 打开→编辑正文→保存→重开的 serializer 级失败 characterization；
4. 增加真实 `openFileInEditor → setReadOnly/onUpdate → autosave → saveActiveDocument` 生命周期 characterization，autosave 开启、零编辑等待至少两个 tick，并记录 dirty/关闭提示/save count/mtime/hash；
5. 记录现有调用图、flags、日志和测试环境；
6. 冻结 encoding、EOL inheritance、PositionMap、file identity、Save As ADR；
7. 建立真实 Tauri dispatcher contract harness 的最小骨架；
8. 固定 SHA 保存 Muya/Vditor 行为矩阵，并对指定 ChatGPT Desktop 版本建立明确标注证据等级的黑盒观察矩阵；
9. 不引入 Core session，不切换编辑器。

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
- 证明 PM serializer characterization 在修复前按预期失败，且 failure 是 byte-level 未触及区差异；
- 使用真实临时文件和实际 autosave 配置证明零编辑生命周期是否 dirty/写盘；至少等待两个 tick，并记录 save count、mtime、SHA-256、soft break、EOL 和尾部 boundary；
- 明确 standalone `setMarkdown/getMarkdown`、oracle self-check 与 `autosave=false` smoke 都不是 lifecycle 证据；
- 检查 harness 自身 negative controls：故意改一个未触及 byte 时必须失败；
- 检查 Patch DTO 可表达显式 paste EOL、普通 inherit 顺序唯一，identity matrix 不会因保存拒绝合法 N+1 patch；
- 检查 guarded-write ADR 明确平台 CAS capability、替换点复核、recovery 和 outcome reconcile；
- 保存 Muya/Vditor 固定 SHA 与 ChatGPT Desktop Observed/Official/Inference 黑盒矩阵；
- 将命令、退出码、hash、diff JSON 和日志写入 P0 验证记录。

AI 不得把“预期失败”的 PM test 混入长期红色默认 suite；应使用明确 baseline characterization 或保存 failure artifact，并在 child change 中说明运行方式。

## 5. 独立 Reviewer 验证

Reviewer 必须独立检查 fixture manifest、2/3-boundary 术语、L0/L1 positive/negative controls、两类 PM 失败复现，以及 encoding/EOL provenance/identity matrix/guarded-write ADR。Reviewer 至少重跑一组 LF、一组 CRLF/Mixed、一组 Unicode、一次故意损坏未触及 byte 的 negative control，以及一次 autosave 开启的零编辑真实文件生命周期。Reviewer 必须确认 lifecycle test 没有 mock 掉 `openFileInEditor`、dirty scheduler、autosave 或 write；任一数据合同冲突、harness 不能抓住故意损坏或人工新发现未被 AI 覆盖时拒绝 P0 Go。

## 6. 人工验证

人工验收人在当前应用中：

1. 为 L0 与 L1 分别准备全新副本，避免 autosave 改写污染后续输入；
2. 分别打开结尾含 2 个 line-break boundaries，以及结尾含 3 个 boundaries（正文后两个视觉空白行）的 L0 副本；
3. 不编辑，等待至少两个实际 autosave interval，记录 dirty、关闭提示、save count、mtime/hash/length 变化；
4. 使用另一组全新 L1 副本，只修改正文中间一个字符并立即主动保存；
5. 使用十六进制工具或验证脚本分别确认 soft break、EOL、尾部 boundary 与 edit range；
6. 重开确认 UI 表现与磁盘 byte diff；
7. 对 LF 与 CRLF fixture 各执行一次；
8. 确认报告区分“尾部换行边界数”和“正文后的视觉空白行数”；
9. 确认 AI 报告准确描述当前失败，不把它误标成已修复；
10. 审阅 ADR 中新增换行的继承规则和无效 UTF-8 行为。

零编辑失败即使比正文编辑失败更严重，也不能替代正文单字符编辑、重开或 ADR 审阅。人工发现 AI 未覆盖的新路径时，P0 进入 corrective run，而不是立即 Accept。

## 7. 必须证据

- environment manifest；
- fixtures manifest 与 SHA-256；
- PM failure 的 input/output bytes diff；
- 零编辑 lifecycle 的 dirty/close-prompt/save-count/mtime/hash 与分项 byte diff；
- L0/L1 harness positive/negative 输出；
- unit/build/Rust/E2E 原始日志；
- 人工操作记录与文件 hash；
- ADR reviewer 签字。
- 独立 Reviewer 报告与关键命令原始输出。
- 开源行为矩阵与 ChatGPT Desktop 公开证据边界记录。

## 8. Go/No-Go

Go：serializer 与真实产品 lifecycle 两类失败都可稳定复现；AI 和人工观察一致；harness 能抓住真实和故意损坏；ADR 无未决数据安全问题；现有基线测试结果已记录。这里的 Go 表示“旧路径失败已被准确刻画，可进入修复阶段”，不表示 legacy 产品通过 byte fidelity。

No-Go：只能通过字符串 trim 比较；CRLF/Mixed/Unicode 无 fixture；用 oracle self-check、standalone Editor 或 `autosave=false` smoke 冒充真实 lifecycle；失败不能稳定复现；规定人工步骤不完整；人工与 AI 观察不一致或出现 AI 未覆盖路径且尚无 corrective run。

## 9. 回滚

P0 只增加测试、fixtures 与文档。回滚为关闭或撤销 P0 child change，不影响产品 runtime。fixtures/harness 应保留供后续阶段使用。
