# Design

## Context

见 `proposal.md` — Why。当前约束（main @ 076d763）：

- `src/lib/` 62 个生产文件 + 71 个测试文件平铺；`src/components/` 28 + 13；`src/utils/` 2 + 2；`src/types/` 5。
- 生产 17,861 行 / 测试 13,375 行；超 500 行的生产文件 13 个，最大 `editor.extensions.ts` 808 行、`fileTree.core.ts` 782 行、`exportTheme.ts` 624 行。
- 已确认的依赖违规（本分支实测）：`src/lib/` 有 16 处 import `src/components/`（`editor.ts`、`editor.table.ts`、`editor.extensions.ts`、`editor.context.ts`、`editor.init.ts`、`editor.image.bubble.ts`、`editor.table-handles.ts`、`editor.complexity.ts`、`documentSessions.ts`、`documentExport.ts`、`docxExport.ts`、`pdfExport.ts`）；`fileTree.core.ts` / `fileTree.inline.ts` 反向 import `sidebar` 的 `openFileInEditor`；`sidebar.fileops ↔ sidebar.conflict` 互引（经 `sidebar.ts` 的 re-export 才不构成文件级强连通分量）。
- 后端 `src-tauri/src/` 13 个文件内联 `#[cfg(test)] mod tests`，共约 1,800 行测试；`menu.rs` 1377 行、`files_image.rs` 1266 行、`files.rs` 1003 行、`export.rs` 779 行、`http.rs` 672 行。
- 现有可用先例：`src/lib/error.ts` 的 `setToastReporter` 惰性注入；`editor.init.ts` 通过参数把 UI 能力传进扩展工厂。

## Goals / Non-Goals

**Goals**

- 建立可判定的分层目录，并让「文件该放哪」由目录语义直接回答。
- 让依赖方向成为机器可校验的约束，而非口头约定。
- 测试代码与生产代码物理分离，测试仍可被现有测试运行器收集。
- 规范从归档目录转正，且由 CI 强制。

**Non-Goals**

- 不改变任何用户可见行为、IPC 命令名、事件名、store 字段、默认设置。
- 不重写编辑器内核，不做 #337 的去重与死代码清扫。
- 不引入新的构建/测试框架，不引入 `dependency-cruiser` 等新依赖（用自研零依赖脚本）。

## Decisions

### D1：分层目录用「职责」而非「文件类型」

采用 `types / utils / infra / editor / render / export / ui / main`，依赖方向 `types ← utils ← infra ← editor/render/export ← ui ← main`。

- **理由**：`lib/` 的问题不是「太深」而是「抽象层级混杂」——编辑器引擎、导出、渲染、基础设施、纯工具同层。按职责分层后，跨层 import 才可被规则判定。
- **备选**：按功能域（`features/editor/`、`features/sidebar/`）横向切。否决原因：现有代码的域边界与层边界高度耦合（一个侧边栏动作同时碰 editor/storage/store），横向切会产生大量跨域 import，反而更难校验。
- **备选**：只分「生产/测试」两目录，不动层。否决原因：issue 的核心诉求之一是消除分层倒置，只分测试目录无法解决。

### D2：UI 能力用「端口对象 + 启动装配」注入，而不是事件总线

在 `src/infra/ui-ports.ts` 定义一组端口（`notify`、`confirm`、`openDocument`、`showDiagramContextMenu`、`showTableContextMenu`、`showImageContextMenu`、`refreshFrontmatterPanel`、`showDegradationBar`、`hideDegradationBar`），由 `src/main.ts` 在启动时 `registerUiPorts(...)` 注入实现。

- **理由**：沿用仓库既有先例（`setToastReporter`、`createMermaidCodeBlockExtension(..., callbacks)`），改动面最小；调用点保持同步调用语义，不引入异步时序。
- **未注册时的降级**：端口实现默认值 = 结构化 `warn` 日志 + 安全跳过，保证纯逻辑单测无需装配 UI 即可运行。
- **备选**：自定义事件总线 / 全局 `window` 挂载。否决原因：隐式依赖更难校验，且会引入新的模块级可变全局状态（正是规范要禁止的写法）。
- **备选**：把 toast 等 UI 组件下沉到 `infra/`。否决原因：toast 操作 DOM 且属于 UI 层职责，下沉会让 `infra` 承担渲染职责，破坏分层语义。

### D3：测试迁移采用镜像 `__tests__/` 目录，而非集中 `tests/unit/`

`src/editor/editor.ts` 的测试放 `src/editor/__tests__/editor.test.ts`；纯 fixture/helper 放 `src/__fixtures__/`。

- **理由**：镜像结构让「这个文件的测试在哪」有唯一答案，且 `vitest` 只需把 `include` 从 `src/**/*.test.ts` 改为 `src/**/__tests__/**/*.test.ts`。
- **备选**：集中 `tests/unit/` 平铺。否决原因：会重演现在「133 个文件平铺」的问题，只是换了目录名。
- **路径风险**：有测试依赖「测试文件相对路径」定位仓库根（`__dirname` + `'..','..'`），迁移后层级变化会导致静默找错文件。迁移时统一改为 `process.cwd()` 或按新层级修正相对深度，并在每批迁移后跑全量 `npm test` 验证。

### D4：依赖与结构校验用零依赖 Node 脚本 `scripts/check-layering.mjs`

脚本用 `readdirSync` + 正则收集 import 边，做三项校验：分层白名单、强连通分量（Tarjan）为 0、测试/生产分离；第四项校验生产文件行数上限 900。

- **理由**：仓库已有同款 gate 思路（`check-archive-synced.sh`、`check-capabilities.sh`），零依赖脚本与现有 CI 风格一致，避免为一次重构引入 `dependency-cruiser` 及其配置维护成本。
- **备选**：ESLint `import/no-restricted-paths` / `dependency-cruiser`。否决原因：仓库当前没有 ESLint 配置（只有散落的 `eslint-disable` 注释），引入 ESLint 生态等于新增构建框架，违反 issue 的「不引入新的构建/测试框架」约束。
- **覆盖范围**：前端 TS 相对 import；后端 Rust 用 `crate::`/`super::` 模块路径做同名规则的白名单校验与 `#[cfg(test)] mod tests` 扫描。

### D5：超行文件拆分按「职责」切，切分边界与目录迁移同批完成

`editor.extensions.ts` → `editor/extensions/{link,paragraph,table,image,code-block}.ts`；`fileTree.core.ts` → `ui/file-tree/{render,events,selection,core}.ts`；`exportTheme.ts` → `export/theme/{tokens,base,html,pdf,docx}.ts`；`imageUtils.ts` → `infra/images/{settings,storage,naming}.ts`；`editor.ts` → `editor/{session,mode,lifecycle}.ts`；`settings.ts` → `ui/settings/{panel,sections}.ts`。

- **理由**：这些文件已经天然按职责分段（同一文件里 5~8 个互不耦合的关注点），拆目录时顺手拆文件，避免二次搬迁。
- **约束**：拆分只做「同内容换文件 + barrel 聚合」，不顺手改逻辑，保证 review 可 diff。

### D6：后端测试外置到同目录 `tests/` 子模块文件

`src-tauri/src/http.rs` 的内联测试移到 `src-tauri/src/net/http/tests.rs`，生产文件末尾只留 `#[cfg(test)] mod tests;`。

- **理由**：`src-tauri/tests/` 是 Cargo 集成测试目录，只能测 `pub` API，且无法访问私有函数；现有测试大量使用私有函数（`validate_port`、`is_documentation_ipv4` 等），外置到 `tests/` 会导致测试失效。同目录 `tests/` 子模块文件既能访问私有项，又让生产文件不含测试代码。
- **备选**：全部迁到 `src-tauri/tests/`。否决原因：如上，会丢失私有函数覆盖，且需要把大量私有函数升为 `pub`，扩大公共面。

### D7：迁移分批，每批一个可独立通过的提交

批次：①`types/utils/infra` → ②`editor` → ③`render/export` → ④`ui` + 端口注入 + 循环解除 → ⑤`main.ts` + 配置 → ⑥后端 → ⑦规范转正 + 门禁 + CI。

- **理由**：每批结束后 `npx tsc --noEmit` + `npm test` 必须全绿，失败可精确定位到批次；`git mv` 保留 blame。

## Risks / Trade-offs

- **import 路径大面积变更导致漏改** → 每批后 `npx tsc --noEmit` 强校验（TS 会报所有未解析模块）；`npm run build` 兜底；最后一批跑全量 `npm test`。
- **端口注入让「谁调用了 UI」变得不直观** → 端口集中在 `src/infra/ui-ports.ts` 单文件声明，`registerUiPorts` 在 `main.ts` 唯一装配点，评审时只需看这两个文件。
- **端口未注册时测试行为与生产不同** → 端口默认实现为「warn + 跳过」，测试显式注册 fake 端口；分层脚本禁止引擎层 import UI 层，防止悄悄回退到直接调用。
- **`vitest` include 改动导致测试被静默漏收集** → 迁移前记录基线用例数（`npm test` 的 `Tests N passed`），每批后比对数量；最终断言用例数与基线一致。
- **依赖 `__dirname` 的测试迁移后静默读错文件** → 改为 `process.cwd()` 基准；并在门禁脚本中禁止测试使用 `__dirname` 相对仓库根的写法。
- **后端拆分后 `lib.rs` 命令注册路径变化导致 Tauri 启动失败** → 每批后 `cargo test` + `cargo clippy --all-targets -- -D warnings`；命令宏名（`#[tauri::command]` 的 `rename`）保持不变，`generate_handler!` 只改路径不改命令名。
- **900 行上限在迁移期被既有文件阻塞 CI** → 门禁脚本随最后一批（⑦）接入 CI，且拆分任务在该批之前完成；脚本自身先本地跑通再上 CI。

## Migration Plan

1. 建立目录骨架 + `scripts/check-layering.mjs`（先只做「测试/生产分离 + 行数」两项，避免迁移期误报），本地跑通。
2. 批①`types/utils/infra`：`git mv` + 修 import → `tsc` + `test`。
3. 批②`editor`（含 `editor.extensions.ts` 等超行拆分 + barrel）。
4. 批③`render/export`（含 `exportTheme.ts` 拆分）。
5. 批④`ui`（含 `fileTree.core.ts`、`settings.ts` 拆分）+ `ui-ports.ts` + `main.ts` 装配 + 解除 `fileTree → sidebar`、`sidebar.fileops ↔ sidebar.conflict`。
6. 批⑤`main.ts` + `vitest.config.ts` / `tsconfig.json` / e2e 引用。
7. 批⑥后端：`net/`、`fs/`、`commands/<子域>/`、测试外置、`menu.rs`/`files_image.rs` 拆分。
8. 批⑦规范转正（`code-standards`、`source-layering` 落地主规范）+ 门禁四项全开 + CI + `AGENTS.md` 清单。

**回滚**：每批为独立提交，`git revert` 单批即可；无数据迁移、无外部契约变更，回滚无需清理状态。

## Open Questions

无。所有会改变实现路径的取舍（端口注入 vs 事件总线、镜像 `__tests__` vs 集中 `tests/`、同目录 `tests.rs` vs `src-tauri/tests/`、自研脚本 vs `dependency-cruiser`）已在上文决策并说明否决理由。
