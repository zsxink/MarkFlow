# MarkFlow Core 功能迁移矩阵

> 状态：M3/M3.1 已验收；M6 Phase 3-5 Core command bridge 迁移中
> 更新日期：2026-07-30
> 用途：定义”现有功能完整迁移”的范围。每项必须有 owner、目标阶段、自动化测试或人工验收记录。
> 所属方案：MarkFlow Core 重构
> M3 验收记录：
> - Core-backed Source Mode save 路径已接入并验收（`core-source` 调 `saveCoreSession()`，`legacy-wysiwyg` 走旧路径）
> - Source Mode 保存不调用 `getMarkdown()` / `write_file` 等 legacy API，内容只来自 Core confirmed snapshot
> - 已通过：markflow-core cargo test (12 passed)、src-tauri cargo test (123 passed)、npm test (401 passed)、npm run build (tsc 无错误)
> - 已通过：cargo clippy --all-targets -- -D warnings（markflow-core + src-tauri 均无警告）
> - Core 代码质量：testing 模块条件编译、移除 blanket allow(dead_code)、OriginalSnapshot 字段封装、expect/unreachable 替换、ID 类型提取、增量测试覆盖、benchmark 重命名、fixtures 目录统一
> - Tauri Backend：document_service.rs 删除、Mutex 安全修复、normalize_lexical 提取、死代码构造器删除、resync 逻辑修复、AppHost 测试
> - 未处理(P2)：scanner.rs 拆分、5 个导出命令统一、TypeScript 大文件拆分、docxExport.ts 类型安全
> - 文档：technical-plan.md 引用更新、m3-core-backed-source-mode.md 验收清单添加
> M4 foundation 记录：
> - Issue #219 建立默认关闭的 Solid shell 入口、session-indexed workspace projection、Editor Adapter 与 Host request context 基础边界
> - 验证重点：Solid store 不保存权威 Markdown 文本；`activeFilePath` 仅由 active session 的 `source.path` 派生；异步结果应用前校验 `sessionId + revision + requestId`
> M6 Phase 3-5 记录：
> - Issue STA-7 / change `m6-phase3-core-command-bridge` 补齐 Bridge IPC、FormatCommandLayer、Toolbar/Keyboard 语义命令迁移规范。
> - Core Source Mode 的 Bold/Italic/Strike/InlineCode/H1/H2/Quote/List/CodeFence/Link、Undo/Redo 进入 Core 主路径；返回 patch + selection_after + revision，正常路径不再整篇 resync。
> - Deferred：Image/TaskList/CopyPaste/StyleMap inheritance 仍归后续 M6/M7；当前不标记为已验收。
> M7C 记录：
> - Issue #232 / change `m7c-assets-transaction` 增加 identity-bound asset transaction：`prepareAssetTransaction`、`commitAssetTransaction`、`rollbackAssetTransaction`。
> - 图片暂存迁移在文档写入/Core 保存成功后才提交清理；失败时保留 recoverable draft 和 mappings。
> - Core-backed Source Mode save 在保存前通过 SourceSyncController 同步资源引用 proposal，避免 Core 保存暂存路径。
> - 验证记录见 `docs/markflow-core-stages/m7c-assets-transaction-evidence.md`。
> M7D 记录：
> - Issue #234 增加 Core Search、Diagnostics 和 Diagram render target API，全部绑定 session/revision/request identity。
> - Search 支持分页、定位 range 和 replace preview；Diagnostics 支持 viewport 过滤并聚合坏链接、缺失图片、重复标题、FrontMatter、表格和图表错误。
> - 验证记录见 `docs/markflow-core-stages/m7d-search-diagnostics-diagram-evidence.md`。

## 1. 使用规则

- M0 冻结当前功能基线，新增功能继续补入矩阵。
- 每项状态只能是 `未开始`、`双轨`、`Core 主路径`、`已验收`。
- “UI 能看到”不等于迁移完成；保存、撤销、冲突和跨模式行为也必须走目标架构。
- 删除旧 ProseMirror 路径前，所有 P0/P1 项必须为 `已验收`。
- 平台相关能力必须分别记录 macOS、Windows、Linux 结果。

## 2. 文档生命周期

| 能力 | 当前实现 | 目标 owner | 目标阶段 | 最低验收 |
| --- | --- | --- | --- | --- |
| 打开 Markdown | TS + Tauri file command → M3: Runtime crate (read + FileIdentity) + Session Registry + Host trait | Runtime + Host | M3 (已验收) | UTF-8/BOM/EOL 正确，创建 session |
| 新建文档 | UI 临时状态 | Runtime | M3/M4 | 未命名 session 可编辑、另存 |
| 保存 | `getMarkdown()` + Tauri write → M3/M3.1: Runtime session.submit_patch + save workflow (pending patch flush, SaveLease, per-path coordinator, atomic write) | Runtime + Host | M3 已验收；M8 移除 legacy serializer | pending patch flush，原子写入 |
| 自动保存 | `main.ts` timer | App Service | M4/M6 | 按 session 保存；不并发保存，不丢 revision |
| 另存为 | UI + dialog | Runtime + Host | M4/M8 | 按 session 另存；路径和资源引用更新一致 |
| 未保存提示 | UI dirty state | Runtime state + UI | M4 | dirty 以 session confirmed revision 为准 |
| 外部修改检测 | watcher + mtime/size → M3/M3.1: Runtime FileIdentity + true reload + conflict gate | Runtime + Host | M3 已验收；M8 完整 Host gate | clean reload、dirty conflict |
| 外部删除 | watcher + UI | Runtime + Host | M4 | 明确保留/关闭/另存路径 |
| 最近文件/目录 | Settings | App Service + Host | M4 | 兼容现有设置迁移 |
| 单实例/CLI 打开 | Tauri lifecycle | Host Adapter | M8 | 不绕过 session lifecycle |
| 同路径多窗口 | 独立窗口状态 | Runtime + Host | M3/M8 | 独立 session；后保存者触发冲突，不静默覆盖 |
| 多文档 session 隔离 | 单 active path/session | App Service + Editor Adapter + Runtime | M4-M8 | UI/命令/任务/导出均显式绑定 sessionId |

## 3. 编辑与导航

| 能力 | 当前实现 | 目标 owner | 目标阶段 | 最低验收 |
| --- | --- | --- | --- | --- |
| Source Mode | CodeMirror → M3/M3.1: Runtime-backed source mode (patch-based sync via Session, strict flush/resync, feature flag 回退) | Editor Adapter + Core | M3 已验收 | 小 patch 同步，不传全文 |
| WYSIWYG | ProseMirror | CodeMirror Live Preview | M5-M8 | 长期保留，保存不经 serializer |
| 模式切换 | 整篇序列化 | Editor Adapter | M5 | byte-for-byte 不变 |
| Undo/Redo | 编辑器 history → M6 Phase 3-5: Core-backed Source Mode 快捷键调用 Core undo/redo IPC，命令前 flush pending patch，返回 patch/selection/revision | Core History | M6 Core 主路径；IME 分组后续补齐 | 单 owner，IME 分组正确 |
| 光标/选区 | PM/CM 各自模型 | Adapter + PositionMap | M3-M6 | 中英文、emoji、组合字符 |
| 大纲 | ProseMirror/DOM 派生 | Core ParseIndex | M2-M4 | 点击定位到 revision range |
| 字数/行数/行列 | 前端统计 | Core + Adapter | M3/M6 | 大文件不阻塞输入 |
| 搜索/替换 | 编辑器能力 → M7D: Core Search API (`DocumentSession::search` / `preview_search_replace`) | Core Search + Adapter | M7D Core 主路径 | session-bound 分页、定位、replace preview |
| 只读状态 | UI/编辑器开关 | Runtime capability | M3/M4 | 两种模式一致 |
| Focus Mode | DOM/CSS | SolidJS UI | M4 | 行为与现有版本一致 |
| 折行/行号/高亮 | 编辑器设置 | Adapter | M4/M5 | 大文件按预算降级 |
| 拼写检查 | WebView/editor | Adapter/Host capability | M4/M5 | 平台差异有明确回退 |

## 4. 格式命令

| 能力 | 目标阶段 | M6 Phase 3-5 状态 | 保真要求 / 验收证据 |
| --- | --- | --- | --- |
| 加粗、斜体、删除线、行内代码 | M6 | Core 主路径 | Source Mode toolbar/keyboard → FormatCommandLayer → Core `EditCommand`；返回局部 UTF-16 patch，沿用可兼容 marker |
| H1-H6 | M6 | Core 主路径（H1/H2 已接 toolbar；Core 支持 H1-H6） | Source Mode toolbar H1/H2 → Core `SetHeading`；未编辑区域保留 ATX/Setext 表达 |
| 引用 | M6 | Core 主路径 | Source Mode toolbar → Core `ToggleBlockQuote`；保留 quote prefix 和嵌套缩进 |
| 无序列表 | M6 | Core 主路径 | Source Mode toolbar → Core `ToggleList(Unordered)`；后续 StyleMap 继承补齐 `-`、`*`、`+` 上下文选择 |
| 有序列表 | M6 | Core 主路径 | Source Mode toolbar → Core `ToggleList(Ordered)`；后续 StyleMap 继承补齐 `.` / `)`、起始编号策略 |
| Task List | M6/M7 | 未开始 | 保留 marker、缩进和大小写；后续 M6/M7 独立迁移 |
| Code Fence | M6 | Core 主路径 | Source Mode toolbar → Core `InsertCodeFence`；空选区插入空 fence，非空选区包裹选中文本；后续 StyleMap 继承补齐反引号/波浪线和 fence 长度 |
| 链接插入/编辑 | M6 | Core 主路径（插入）；编辑后续 | Toolbar/Ctrl+K 复用安全 link dialog，Source Core 下发 `InsertLink` 并保留 dialog display text；reference/autolink 未编辑表达后续验收 |
| 图片插入/编辑 | M6/M7 | 双轨 / 后续迁移 | 当前仍由图片资源事务与 legacy source insertion 处理；Core `InsertImage` bridge 可用但文件事务、引用策略未完成，不标记已验收 |
| 复制/粘贴 | M6 | 未开始 | 明确 plain text、Markdown、图片优先级；后续独立迁移 |

## 5. 专业 Markdown

| 能力 | 目标阶段 | 最低验收 |
| --- | --- | --- |
| GFM 表格展示 | M5/M7 | viewport widget 与源码 range 对齐 |
| GFM 表格编辑 | M7 | cell/行/列/对齐；pipe 转义正确 |
| 表格列宽拖拽 | M7 | 作为视图状态保留交互，不向 Markdown 注入私有宽度语法 |
| FrontMatter 显示 | M2/M5 | 识别 delimiter 与原始 range |
| FrontMatter 结构化编辑 | M7 | safe subset；复杂语法回退源码 |
| HTML Comment | M2/M5 | 可显示/折叠，保存原文 |
| Mermaid | M7D Core render target API | 源码可编辑、延迟渲染、错误隔离 |
| PlantUML | M7D Core render target API | 网络权限、超时、错误隔离 |
| 未知语法 | 全阶段 | 以源码显示，不阻止打开和保存 |

## 6. 图片与资源

| 能力 | 当前基线 | 目标阶段 | 最低验收 |
| --- | --- | --- | --- |
| 本地图片选择 | 已支持 | M4/M6 | window-scoped Host dialog + session-bound Core insert plan |
| 剪贴板图片 | M7C 事务化 prepare/commit/rollback；pending draft 保留 | M6/M7 | session-bound 命名模板、暂存、首次保存迁移 |
| 拖拽图片 | M7C 复用统一图片事务保存边界 | M6/M7 | session-bound 多图顺序、失败隔离 |
| 网络图片 | 已支持 | M7 | SSRF 防护、类型/大小限制 |
| 相对/绝对引用 | M7C 已通过事务 proposal 验证 | M7 | Windows/macOS/Linux 路径正确 |
| 自定义/文档资源目录 | M7C 已覆盖 custom/document-dir/document-named-dir | M7 | 三种存储策略兼容 |
| 图片上下文菜单 | 已支持 | M4/M7 | 复制、另存、路径、所在目录 |
| Mermaid/PlantUML 导出 | 已支持 | M7/M8 | SVG/PNG、复制和另存 |

## 7. 文件树与应用外壳

| 能力 | 目标阶段 | 最低验收 |
| --- | --- | --- |
| 打开目录、文件树分页、懒加载 | M4 | 大目录预算与现有设置一致 |
| 展开状态、忽略规则 | M4 | 设置迁移不丢失 |
| 新建、重命名、删除 | M4 | 活跃文档路径和冲突状态同步 |
| 拖拽和上下文菜单 | M4 | 键盘可访问和焦点恢复 |
| Toolbar/Menu | M4/M6 | action 不直接依赖 ProseMirror |
| Settings/Theme | M4 | 版本迁移和跨窗口一致 |
| 大文件阈值设置 | M2/M4 | 产品档位只按 UTF-8 文件字节数；旧行数阈值迁移为内部预算或明确废弃 |
| Toast/Modal/Dialog | M4 | 错误可恢复，不吞掉保存失败 |
| Degradation Bar | M3/M4 | Large/Huge 状态来自 Runtime |

## 8. 导出与打印

| 能力 | 当前实现 | 目标阶段 | 最低验收 |
| --- | --- | --- | --- |
| HTML | 编辑 DOM snapshot | M8 | session confirmed Export IR golden test |
| PDF 文件 | HTML + native WebView | M8 | session Export snapshot 与编辑模式无关 |
| Word/DOCX | HTML -> JS docx | M8 | session Export IR；列表、表格、图片、代码块 smoke |
| 系统打印 | WebView print | M8 | Host Adapter 能力，跨平台回退 |
| 导出主题/字体/媒体等待 | 前端 | M8 | 视觉回归和超时清理 |

## 9. 质量与安全

| 能力 | 目标阶段 | 最低验收 |
| --- | --- | --- |
| 原子写入 | M3 已验收；M8 完整 Host portability | 失败不覆盖旧文件，保留权限 |
| 路径穿越/符号链接防护 | M7/M8 | 复用并扩展现有 Rust 测试 |
| 网络图片 SSRF 防护 | M7 | mock DNS，测试不依赖公网 |
| 日志脱敏 | 全阶段 | 不记录正文、完整路径、凭据 |
| 不受信任 Markdown/HTML/图表 | M5-M8 | raw HTML 不执行；SVG/HTML sanitize；解析和输出有资源上限 |
| 任务取消 | M2-M8 | revision 变化后旧任务不能提交 |
| 崩溃恢复 | M6/M8 | 至少恢复到最后成功保存 revision；未确认镜像不能冒充已保存状态 |
| Accessibility | M4-M8 | 键盘、焦点、表格、widget 基础验收 |

## 10. 发布退出条件

M8 只有在以下条件全部满足时才算完成：

- P0/P1 功能均为 `已验收`。
- 所有保存入口只接受 Core confirmed snapshot 作为内容来源，并只由 Runtime 编排写入。
- Source 与 WYSIWYG 对同一 fixture 的保存结果一致。
- macOS、Windows、Linux release smoke 全部通过。
- 真实中文输入法、日文输入法至少各完成一个平台人工验收。
- 旧 ProseMirror serializer 路径经过稳定观察期后移除。
- 数据损坏、静默格式重写和错误路径写盘问题为零。

## 11. M0 冻结当前基线

M0 OpenSpec apply 未修改产品运行路径；仅为离线验证修正了 Rust HTTP redirect 测试 fixture，避免测试依赖公网 DNS。当前 owner 基线如下，后续迁移必须逐项更新 owner、阶段和验收记录。

| 范围 | 当前 owner / 实现 | 目标 owner | 目标阶段 | M0 验收记录 |
| --- | --- | --- | --- | --- |
| 文件打开/保存 | TS workflow + Tauri file commands；保存内容来自 `getMarkdown()` → M3: Runtime read/write + Session + Host trait | Runtime + Host | M3/M8 | CodeGraph 观察记录在 `implementation-notes.md`；分支 `feat/issue-205-m3-core-backed-source-mode`；6.3 save 路径分派已验证 |
| Source Mode | CodeMirror 6 前端镜像，切换时从 serializer 或源码同步 → M3/M3.1: Runtime-backed source mode (patch-based sync via Session) | Editor Adapter + Core | M3 已验收 | `parser-comparison-report.md` 与 `ipc-patch-report.md`；分支 `feat/issue-205-m3-core-backed-source-mode`；save/flush/resync/feature flag 路径已接入 |
| WYSIWYG | Tiptap/ProseMirror + serializer | Core-backed Live Preview / Editor Adapter | M5-M8 | Product plan 明确长期保留 |
| History | 编辑器 history | Core History | M6 | `adr-history-owner.md` |
| 图片/资源 | TS image utils + Tauri image commands | Runtime asset workflow + Host | M6/M7 | 当前仅冻结 owner，不迁移 |
| 图表 | 前端渲染与导出路径 | Internal provider + Host renderer/export | M7/M8 | 当前仅冻结 owner，不迁移 |
| 导出/打印 | DOM/HTML snapshot + Tauri/WebView print/export | Export IR + Host | M8 | 当前仅冻结 owner，不迁移 |
| Settings/Theme | TS store + Tauri settings config | App Service + Host | M4 | 当前仅冻结 owner，不迁移 |
| 外部修改/冲突 | watcher + mtime/size + UI conflict flow → M3/M3.1: Runtime FileIdentity、true reload、PathSaveCoordinator conflict detection | Runtime + Host | M3 已验收；M8 完整 Host portability | clean reload、dirty conflict、同路径后保存冲突已进入 Runtime 路径 |
| 大文件分级 | `document-size-tier` 同时使用 byte 与 line count | Core byte-based tier + budget inputs | M2/M4 | follow-up 记录在 `reports/document-size-tier-follow-up.md` |
| 跨平台 release matrix | 依赖现有 e2e/release smoke | Host Adapter release gate | M8 | 归档/合入前需 macOS、Windows、Linux 记录 |
