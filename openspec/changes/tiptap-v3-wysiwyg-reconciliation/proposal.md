## Why

MarkFlow 当前的 TipTap v2 + `tiptap-markdown` 链路无法可靠承载表格、任务列表、图表围栏和未来未知语法的无损往返，现有基于文本长度的完整性兜底也只能发现部分截断，不能防止静默改写或虚假 dirty。升级到 TipTap v3 与 `@tiptap/markdown` 后，MarkFlow 才能建立可测试、可回退的 Markdown 双向契约，并分阶段引入资格门禁、占位 token 与 reconcile，避免 WYSIWYG 编辑损坏源文件。

## What Changes

- **阶段一——方案 B 的降风险版**：只完成 TipTap v2 → v3、`tiptap-markdown` → `@tiptap/markdown`、废弃列表/表格分包替换、现有自定义 hooks 重写和 Markdown bridge 接入；本阶段明确不启用资格门禁、opaque token 或 reconcile。
- **BREAKING（内部扩展 API）**：阶段一会替换 Markdown 扩展 hooks 与 TipTap 包结构，但不改变用户可见文件格式、编辑器公共 API 或 Tauri 命令。
- 阶段一以 v2 冻结基线、round-trip differential corpus、单元测试、类型检查、构建、关键 E2E、只读真实文档扫描、性能对比和回退演练作为硬验收门。
- **硬停止点**：阶段一验收报告未达到全部 PASS 时，实施 MUST 停止在 `v3-compatible`，不得开始完整 B；失败项必须先修复或回退，再重新执行整套验收。
- **阶段二——完整方案 B**：仅在阶段一全部通过并获得维护者确认后，依次实现 WYSIWYG 资格门禁、opaque placeholder token、三方 reconcile、失败保护与 Source 恢复路径。
- 完整 B 启用后，只有满足安全往返契约的文档才能进入可编辑 WYSIWYG；可安全透传的未知块逐字节恢复，无法证明安全的保存候选不得覆盖原文。

## Delivery Strategy

| 阶段 | 包含 | 明确排除 | 完成条件 |
|---|---|---|---|
| 一：降风险版 B | v3 依赖迁移、v3 Markdown hooks、统一 bridge、现有能力兼容与回归基线 | 资格门禁、opaque、reconcile、新 dirty 语义 | 阶段一验收报告所有门禁为 PASS，且回退演练成功 |
| 二：完整 B | 资格门禁 → opaque → reconcile → dirty/autosave 安全集成 | 自动合并外部修改、数学公式、Live Preview | 每个子阶段独立测试通过，最终完整回归与恢复路径通过 |

“没有问题”在本 change 中不表示无法证明的绝对无缺陷，而表示：已定义的自动化、差分、E2E、真实文档只读扫描、性能和回退门禁均无阻断结果，且所有已知差异均被登记为允许规范化或修复完成。

## Capabilities

### New Capabilities

- `wysiwyg-markdown-round-trip`: 定义 TipTap v3 Markdown bridge 对常用块级/行内语法、表格、列表、链接、图片和图表围栏的解析—编辑—序列化保真契约。
- `wysiwyg-markdown-reconciliation`: 定义 WYSIWYG 资格门禁、opaque token、三方对账、失败保护、诊断与分阶段启用行为。

### Modified Capabilities

- `codemirror-source-editor`: 将模式同步从具体的 v2 storage API 改为统一 Markdown bridge，并补充被门禁拒绝或 reconcile 失败时 Source 作为原文恢复面的要求。
- `code-block-serialization`: 扩展围栏代码块契约，使语言、尾随换行、Mermaid/PlantUML 类型及围栏安全性在新引擎往返中保持不变。
- `autosave-dirty-guard`: 明确解析、token 恢复和 reconcile 等程序化表示转换不得制造虚假 dirty 或触发自动保存。

## Impact

- 主要代码：`src/lib/editor.init.ts`、`src/lib/editor.ts`、`src/lib/editor.extensions.ts`、`src/lib/editor.serializer.ts`、`src/lib/editor.state.ts`、Source/WYSIWYG 切换与保存调用链，以及对应单元/E2E 测试。
- 依赖：升级 `@tiptap/*` 到 v3，引入 `@tiptap/markdown` 与 v3 列表聚合包，移除 `tiptap-markdown`、废弃的 task-list/task-item 分包和独立 table row/cell/header 分包；marked facade 是否自建由设计验证决定。
- 数据：磁盘上的 Markdown 仍是唯一持久化格式；迁移不得批量重写既有文件，opaque token 与 reconcile 元数据仅存在于内存。
- 兼容性：现有编辑器公共 API、Tauri 命令、Source 模式和保存流程保持可用；不满足 WYSIWYG 安全契约的文档会被降级到 Source，而不是冒险改写。
- 交付：对应 GitHub Issue #258；阶段一和阶段二分别形成验收证据，阶段一未通过时完整 B 不得启动。
