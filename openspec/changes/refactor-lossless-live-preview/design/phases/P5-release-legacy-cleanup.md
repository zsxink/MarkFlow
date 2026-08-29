# P5：最终发布稳定性与 Legacy 清理

## 0. 执行位置

P5 的阶段编号保留以兼容既有证据链接，但执行顺序调整为 P4B → P6 → P7 → P5。P5 是 program 的最后阶段；此前的 P2/P3 只能叫 Live Preview 里程碑，P6/P7 才构成产品目标。

## 1. 目标

在 Typora 式基础编辑和富块支持矩阵已验收、三平台稳定观察证明新路径可承担产品默认编辑后，删除 ProseMirror/Tiptap、serializer、双正文状态和失效依赖。删除后运行时回滚单位为应用版本。

## 2. 输入与依赖

- P3 Go、P4A `Program-Accepted`、`P4B-SUBSTRATE-GO`、P6 Go、P7 Go 均已记录；P4B 单项结果已由 P7 最终矩阵收口；
- P7 发布支持矩阵由 Program Owner 签署；所有 `WYSIWYG-required` 项达到声明的 hidden/widget maturity 与 default，所有 `policy-required` 项达到声明的安全终态（可以是 source fallback）；
- 无未解决数据完整性、安全、跨文档、selection/IME 或资源事务问题；
- `design/00-program-governance.md` 与 [P5 验证记录](../../validation/phases/P5.md)。

## 3. 实施范围

- macOS/Windows/Linux release candidate 验证；
- Normal/Large/Huge、真实 IME、themes、marker hidden/reveal、rich blocks、export、autosave、conflict 稳定观察；
- 三平台各 ≥8 小时/≥2 session，自动化 10k transactions、1k save/reconcile、1k mode switches、100 projection/widget failure injections；
- 审计所有 PM/Tiptap/getMarkdown/setMarkdown/trailingNewlines/normalize 消费者；
- 删除 legacy editor、隐藏 DOM、serializer 保存 facade、CSS、dependencies、tests；
- 保留只读 renderer 时明确隔离且不可回写正文；
- 更新 docs、issue、migration notes、feature flags、support matrix；
- sync specs、validate、archive umbrella change。

## 4. 验证

AI 与 Reviewer 必须覆盖：

- legacy symbol/import/CSS/dependency/bundle 清零；
- npm install/lockfile、unit、typecheck、build、Rust fmt/clippy/test；
- canonical L0/L1、desktop semantic、P6 marker、P7 rich block、visual/IME/keyboard/a11y/security E2E；
- 三平台零编辑打开、两个 autosave tick、干净 Ctrl+S、关闭/reopen 的 dirty/save count/hash/length/mtime；
- Normal/Large/Huge SLO、memory leak、viewport widget churn；
- conflict/autosave/resource/save-as/export/print/crash-restart/sleep-resume；
- readonly export renderer 不可回写；
- `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh`；
- 独立 Reviewer 对 cleanup diff 与关键测试的复跑。

人工必须在声明平台执行真实写作流：marker 隐藏/揭示、空构造、CJK/Japanese IME、nested selection、task/image/table/diagram、Source 往返、Undo/Redo、失败回退和资源操作。

## 5. Go/No-Go

Go：P7 支持矩阵达到目标；新路径在声明平台通过；最终默认配置零编辑无写盘；稳定观察与性能 SLO 通过；关键错误为零；legacy 产品真相清零；独立 Reviewer 与人工批准；archive gates 通过。

No-Go：任何 serializer/双 owner 残留；`WYSIWYG-required` 低于签署 hidden/widget maturity 或规定默认 OFF；`policy-required` 低于签署安全目标；marker/IME/selection 阻塞；关键平台未验；稳定期数据或安全问题；只能靠重新引入 PM 才能正常编辑。`Policy-required` 已达到签署 source-fallback 目标不构成 No-Go。

## 6. 回滚

P5 合入后不运行时热切 owner。严重问题回滚到上一已签名应用版本，并先保护用户文件、验证新版本产生的 Markdown bytes 兼容；release notes 记录回滚版本和恢复步骤。
