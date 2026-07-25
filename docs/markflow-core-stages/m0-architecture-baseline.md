# M0: Architecture Baseline

## 阶段目标

确认 MarkFlow 长期架构边界，并把重构共识沉淀为可执行的设计基线。

核心结论：

- MarkFlow 的长期文档能力资产是 `markflow-core`，应用工作流资产是 `markflow-runtime`；两者都不绑定 Tauri command 或 ProseMirror serializer。
- Markdown 原文是唯一文档真相。
- Tauri 是第一个 Host Adapter，不是应用框架。
- UI 迁移到 SolidJS，但放在 Core-backed Source Mode 稳定之后、Core-backed WYSIWYG 之前。
- 所见即所得编辑模式必须长期保留。
- 插件系统不进入本轮实施范围，只保留内部扩展点。
- M0 必须产出可运行 spike 和量化基线，不是纯文档阶段。

## 技术方案

### 1. 确认最终分层

目标架构：

```text
UI（SolidJS）
  ↓
Editor Adapter（TypeScript / CodeMirror）
  ↓
Core Bridge（IPC / WASM / Native Binding）
  ↓
markflow-runtime（Session / Task / Save / Sync）
  ├── markflow-core（Rust）
  └── Host Adapter（Tauri / Electron / Web / CLI）
  ↓
Platform（Windows / macOS / Linux / Browser）
```

依赖约束：

- `markflow-core` 不依赖 Tauri、DOM、CodeMirror、SolidJS、ProseMirror。
- `markflow-core` 不直接执行文件、网络、剪贴板、对话框和打印等副作用。
- `markflow-runtime` 协调 Core 与 Host Port，不实现 Markdown 语法。
- Host Adapter 实现平台能力，不拥有 Markdown 编辑模型。
- Editor Adapter 只负责用户输入、selection、IME、decorations、widgets。
- UI store 只保存 session id、revision、selection、viewport、panel state，不保存权威 Markdown。

### 2. 明确 Core API 方向

M0 不实现 API，但需要确认 Core 将围绕这些概念设计：

- `DocumentSession`
- `OriginalSnapshot`
- `TextBuffer`
- `LineIndex`
- `SourceRange`
- `TextPatch`
- `RenderIR`
- `ExportIR`
- `InternalProviders`
- Runtime `HostCapabilities`

### 3. 确认迁移策略

迁移顺序：

1. 建立 Core Foundation。
2. Source Mode 接入 Core。
3. 保存内容切换为 Core confirmed snapshot，Runtime/Host 接管保存编排。
4. 提取 Editor Adapter，并增量迁移 SolidJS UI 外壳。
5. Live Preview 接入 Core Render IR。
6. Core-backed 所见即所得编辑模式上线。
7. 工具栏命令和 History 迁移到 Core。
8. 表格、FrontMatter、图片、搜索、诊断、导出迁入目标 Core/Runtime/Host 边界。
9. 移除 ProseMirror serializer 保存链路。

### 4. 技术 spike

M0 必须完成五类最小验证：

1. Parser：以真实 fixture 比较 `markdown-rs` 与对照 parser 的位置、GFM、错误恢复和 1/10/50MB 性能。
2. Buffer/Position：验证 UTF-8 byte、UTF-16、LF/CRLF/Mixed EOL 双向映射。
3. IPC Patch：验证 10MB CodeMirror transaction -> Tauri -> Rust ack 的延迟、批处理、revision mismatch 和 resync。
4. FrontMatter：验证 lossless CST 对注释、顺序、quote、空行和复杂 YAML 的安全编辑边界。
5. Reference Implementation：以 `bekoedit` / `bekoedit-markdown` 为对照，验证 Markdown 原文真相、revision-scoped `BlockId`、最小 `SourcePatch`、Raw Markdown Island 和 typed UI contract，并运行 MarkFlow lossless fixture 与 1/10/50MB benchmark。

`bekoedit` 只作为参考实现，不在 M0 前预设为生产依赖。M0 必须通过 ADR 在以下结论中选择一种：

- 仅参考设计，自主实现 `markflow-core`。
- 引入 `bekoedit-markdown` 的稳定子集并由 MarkFlow 封装 API。
- 在遵守 Apache-2.0 与 NOTICE 要求的前提下维护经过裁剪的 fork。

默认结论是“仅参考设计”；只有兼容性、性能、维护活跃度和 API 稳定性证据同时通过，才能升级为依赖或 fork。

### 5. ADR 与基线

至少输出：

- Core / Runtime / Host 依赖方向 ADR。
- 文档真相、乐观镜像和保存 owner ADR。
- 坐标与 EOL 模型 ADR。
- History 单一 owner ADR。
- parser/buffer 暂定选型 ADR。
- `bekoedit-markdown` 采用策略 ADR。
- 性能基准机、fixture 规模和 p95 预算。
- 当前功能迁移矩阵与跨平台 release matrix。

## 交付物

- `docs/markflow-core-stages/product-plan.md`
- `docs/markflow-core-stages/technical-plan.md`
- `docs/markflow-core-stages/feature-migration-matrix.md`
- `docs/markflow-core-stages/m0-architecture-baseline.md` 至 `m8-export-ir-host-portability-full-migration.md`
- 五类 spike 代码/benchmark 与 ADR。

## 验收标准

- 文档明确写出 Tauri 是 Host Adapter。
- 文档明确写出 Markdown 原文是唯一真相。
- 文档明确写出 `markflow-core` 不依赖 Tauri、DOM、CodeMirror、ProseMirror。
- 文档明确写出所见即所得编辑模式长期保留。
- 文档明确写出插件系统本轮不做。
- 文档明确写出超过 1MB 的 Markdown 文档进入 Large Document 策略。
- 每个阶段都有目标、技术方案和验收标准。
- 后续 OpenSpec proposal 可以直接引用本阶段文档。
- parser、position/EOL、IPC patch、FrontMatter spike 均有可重复结果。
- `bekoedit-markdown` 对照测试覆盖 MarkFlow lossless fixture、语义命令、过期 revision 和 1/10/50MB 性能，并形成采用策略 ADR。
- 性能目标使用 p95 数值并记录基准机，不使用“流畅”作为验收。
- 功能迁移矩阵覆盖当前文件、编辑、图片、图表、导出、设置和冲突路径。
- Rust/TS 基线测试不访问公网；现有 DNS 依赖测试已改为 mock/local resolver。

## 测试要求

M0 不进入产品功能实现，但 spike 必须有测试：

- 产品方案 review。
- 技术方案 review。
- 阶段拆分 review。
- position/EOL property test。
- parser fixture/differential test。
- IPC latency benchmark。
- FrontMatter lossless fixture。
- `bekoedit-markdown` differential fixture、API compatibility test 和 benchmark。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 阶段边界过大 | 每个阶段只允许一个主目标，不能把 UI 迁移和 Core Foundation 混在一起 |
| 团队继续把 Tauri 当业务层 | 文档和代码命名统一使用 Host Adapter / Core Bridge |
| 过早承诺第三方插件 ABI | 本轮不做插件系统，只保留内部 provider 边界 |
| M0 被当成文档会议 | 用可运行 spike、benchmark 和 ADR 作为退出条件 |
| 选型靠偏好而非证据 | 使用同一 fixture、同一机器和同一指标做对照 |
| 参考实现反向锁定 Core | 默认只参考不依赖；通过适配层、ADR、license 检查和可替换性测试控制采用范围 |
