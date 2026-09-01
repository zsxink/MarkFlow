# MarkFlow 代码规范（新增）

> 建议落地日期：2026-08-31
> 适用：`src/`（TS/TSX）、`src-tauri/src/`（Rust）、`docs/`、`scripts/`
> 目的：本仓库目前只有 git 流程规范（`AGENTS.md`/`CLAUDE.md`），**缺少代码级规范**。本文补上文件行数、分层、命名、错误处理、安全、去重、提交等硬性约定。

---

## 1. 文件大小

**硬上限：单文件 500–900 行**（本次盘点据此筛选超行文件）。

- **目标**：多数文件 ≤ 500 行，**上限 900 行**（允许少数承载数据表/枚举的文件超出，但须在头部注释说明原因）。
- 超过 400 行即进入「考虑拆分」观察区；超过 900 行必须拆分。
- 拆分优先按**职责/生命周期**切分（如 editor.extensions 一篇一个扩展、files_image 拆 pending/remote/storage），不是按行数硬切。
- 测试文件可适当放宽（如 `imageUtils.test.ts` 359 行、`exportTheme.test.ts` 170 行），但同样不建议超过 900 行。
- Rust：命令文件超 600 行应拆子模块（`mod/<子域>.rs`），超长模块随对应逻辑搬迁。

## 2. 分层与依赖方向

禁止循环依赖和分层倒置。规则：

- **依赖单向**：`types/` ← `utils/` ← `lib/`（编辑器逻辑）← `components/`（UI）← `main.ts`（入口）。
- **`lib/` 不得 import `components/` 或 `ui/`**。需要 UI 能力（toast、右键菜单、弹窗）时，通过**构造函数/参数注入回调**，参照 `editor.init.ts` 的 `createMermaidCodeBlockExtension(..., callbacks)` 先例。
- **组件模块之间不得互相 import 形成循环**。如 `sidebar.fileops ↔ sidebar.conflict` 互相引用 → 抽共享操作到独立模块（如 `sidebar.actions.ts`）。
- **barrel（聚合导出）不得被绕过**。某模块已提供 barrel（如 `fileTree.ts`），内部文件一律从 barrel 导入，不直接 import `./fileTree.core`。
- **数据/状态 store 直接由消费方导入**，不通过渲染组件中转再导出（如 `sidebar.ts` 不应再导出整个 `activeDocument` store）。
- **active-path/active-document 等概念保持单真相**，不并行维护两套 accessor。

## 3. 命名

- **TS**：文件名小写短横线（`file-tree.core.ts`、`editor.extensions.ts`）；组件/类 `PascalCase`；函数/变量 `camelCase`；常量 `UPPER_SNAKE`。
- **Rust**：文件 `snake_case`；函数 `snake_case`；结构体 `PascalCase`；常量 `SCREAMING_SNAKE`。
- **导出即公共 API**：不 export 仅本文件/本模块使用的符号（`copyImageToStorage`、`compareEntries`、`classifyError` 这类应去 export 或私有化）。
- 寓意明确的私有辅助函数尽量 `private` / `pub(crate)`，减少对外表面积。
- 命名要表达意图：避免 `data`/`tmp`/`_state` 这种无含义或带下划线未用参数长期残留。

## 4. 错误处理

统一采用**结构化、可分类**的错误约定，避免两种并存。

- **Rust**：向外抛错优先用 `AppError`（含 `AppErrorCode`），少用 `Result<_, String>` 裸字符串。逐步把现存约 30 个返回字符串的 command 迁移到 `AppError`。
- **不要在非测试生产路径 panic**：`unwrap()`/`expect()`/`unreachable!()` 一律禁止用于可能失败的常规路径。Mutex 被毒化时用 `error::lock_mutex(...).unwrap_or_else(recover)` 恢复，不 `.lock().unwrap()`。
- **不吞错误**：`resolve_path` 这类不可把 canonicalize 出错静默当作"用原路径"，应返回 `Result` 让调用方区分。
- **TS**：命令调用失败用统一 `classifyError` 分类；`catch` 里至少 `logger` 记录，不静默。

## 5. 安全硬性约定（本仓库为本地文件编辑器，安全优先）

- 所有**写盘路径**必须过 workspace 校验 + 大小上限（`MAX_IMAGE_SIZE`）。
- **杜绝 `write_file_binary` 式零校验任意写盘**——任何写文件命令必须 `resolve` + `validate_path_in_workspace` + 大小检查后再写。
- 路径穿越/符号链接防护、base64 解码 + 20MB 上限校验，集中在**单一助手函数**复用，不允许 8 处手抄（防未来改一处漏八处）。
- 原子写（temp + `sync_all` + rename）统一走一个 `fs/atomic.rs` 助手，保证 temp 与目标同目录、Windows 语义一致。
- DOM/SVG 消毒（DOMPurify）收拢为公共 helper，mermaid/plantuml 共用。
- unsafe Rust 必须带 `// SAFETY:` 注释；能避免的 unsafe（如 `kill(pid,0)`）优先用安全替代。

## 6. 去重（DRY）

- **同一逻辑只实现一次**。出现第三处即应抽公共助手。
- 已知待去重清单（落地时逐个闭合）：
  - TS `blobToBase64` ×4 → `lib/base64.ts`
  - TS SVG→PNG ×3 → `svgToPng` 模块
  - TS mermaid/plantuml 右键菜单 + helper → 参数化 `diagramContextMenu.*`
  - TS modal/dialog 双系统 → 统一
  - Rust 原子写 ×5、`normalize_lexical` ×2、目录枚举 ×2、symlink 防护 ×2、base64 校验 ×8、远程抓取 ×2、save-as 导出 ×4
- 新增代码在写第三个相似块之前，先查是否已有可复用助手。

## 7. 注释

- 除非必要，不加注释；注释解释**为什么**而非**是什么**。
- 不用注释叙述"已删除代码的历史"（如"removed X is verified by tests"），删除即删除，测试即文档。
- 不用 `#[allow(dead_code)]` 掩盖未用代码——要么删，要么真正接上。允许临时的必须带 TODO issue 号。
- 废弃/冻结文档必须在文件头部加醒目状态横幅（`> 状态：已废弃...`）。

## 8. 提交 / Issue（沿用 AGENTS.md，补充代码级）

- 每次**重构 = 独立 issue + 分支**，commit message 中文描述 + `type:`。
- 一次重构只做一件事，便于 review 与回滚；不要"顺手"改无关代码。
- 每处重构闭合前跑：TS `npx tsc --noEmit` + `npm test`；Rust `cargo check`（必要时 `cargo test`）。
- 涉及公共 API 变动的重构（DOCX 共享、active-path 统一、barrel 拆分）先 `/opsx:explore` 再实施。

## 9. 文档规范

- `docs/` 的单篇叙述性文档分三类，头部标注类型：
  - **规范**：唯一权威源（放入 `openspec/specs/`，不用散落 docs）。
  - **知识/经验**：历史排障背景，标注"非规范"（如 `docs/knowledge/`）。
  - **一次性验收/报告**：标注"为历史记录"，注明复跑命令，不入库可再生产物。
- 性能/体积类**快照产物**（如 bundle-report.html）不入 git，改由命令/CI 生成。
- 已放弃的方案（如 `docs/markflow-core-stages/`）标记废弃或归档，不得继续以"待实施"面貌存在。
