## Why

Issue #254 的无损重构（CodeMirror Live Preview + 最小 Rust Core）在改任何产品代码之前，必须先把「当前 ProseMirror 路径会破坏文末空行等未触及字节」变成可机器判定的证据，并把 L0/L1 byte 合同、坐标、EOL、identity、guarded-write 等关键决策冻结成 ADR。否则后续 Slice 无法区分「回归」与「既有损失」，也无法建立可信的 Go/No-Go 门禁。

## What Changes

- 固定当前基线 `feat-v0.1.0@6bfba453` 的 SHA、调用链、feature flags、日志目录与测试环境，作为 P0 与后续 Slice 的对照锚点。
- 建立 canonical binary byte fixtures 与 manifest：UTF-8/BOM、LF/CRLF/CR/Mixed EOL、文末 0/1/2/3 个换行边界、Unicode（CJK/emoji/组合字符）、列表/fence/frontmatter/图片/malformed，全部合成生成并记录 SHA-256。
- 建立 L0（无编辑 byte-for-byte hash）与 L1（局部编辑后 surviving-interval 保真）验证 harness，含 positive/negative controls；故意改动一个未触及 byte 必须被 harness 拒绝。
- 为当前 ProseMirror 路径添加两类 baseline characterization：一类稳定复现「修改正文后文末空行 byte 丢失」，另一类覆盖真实桌面 `openFileInEditor → setReadOnly/onUpdate → autosave → saveActiveDocument` 生命周期，稳定复现「零编辑打开即 dirty 并自动改写文件」。两类测试都必须记录 byte/hash/mtime/save-count 证据，并证明 #189 的 `trailingNewlines` 元数据补偿不满足 L0/L1；预期失败 characterization 独立于默认红色 suite。
- 冻结 ADR：UTF-16↔UTF-8/source byte 坐标、EOL inheritance 与显式 paste provenance、按操作 identity matrix、macOS/Windows/Linux guarded-write/CAS capability 与无能力时 Save Copy 降级、无效 UTF-8 行为、Save As 格式策略。
- 为当前 `read_file/write_file` 与未来 Core commands 建立真实 Tauri dispatcher contract harness 最小骨架，禁止仅 mock `invoke`。
- 以固定 SHA 保存 Muya/Vditor 行为矩阵；对 ChatGPT Desktop 26.803.61601 建立严格区分 Observed/Official/Inference 的黑盒观察矩阵。
- **不实现** markflow-core、**不切换**默认编辑器路径、**不 cherry-pick** feat-v0.1.0-draft。

## Capabilities

### New Capabilities

- `byte-contract-harness`: 定义 canonical byte fixtures 的生成与 manifest 合同、L0 byte-for-byte hash 判定、L1 surviving-interval 判定、negative control 规则、PM 尾换行丢失与零编辑 autosave 改写的 baseline characterization，以及真实 Tauri dispatcher contract harness 的最小验证协议。

### Modified Capabilities

（无。P0 是现状刻画与证据建立阶段，不改变任何产品行为，因此不修改既有 capability 的 REQUIREMENTS。）

## Impact

- 新增测试与工具：canonical fixtures、L0/L1 harness、PM characterization 测试、dispatcher contract harness 骨架、fixture manifest 工具。
- 新增文档：P0 ADR（坐标/EOL/identity/guarded-write/无效 UTF-8/Save As）、Muya/Vditor 与 ChatGPT Desktop 行为矩阵、环境与运行记录。
- OpenSpec：新增 child change `p0-lossless-byte-contract`，引用 umbrella `refactor-lossless-live-preview` 的 P0 阶段设计与 `validation/phases/P0.md`。
- 产品代码：P0 阶段保持零行为改动；若 PM 回归需要最小 test hook，将单独说明并保持默认路径不变。
- 数据源：fixtures 全部为合成数据；`/Users/xian/markflow-test` 仅作为人工样本来源，不被写入或改写。
