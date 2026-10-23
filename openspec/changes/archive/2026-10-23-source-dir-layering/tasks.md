# Tasks

## 1. 目录骨架与门禁脚本（先行）

- [x] 1.1 创建 `src/{infra,editor,render,export,ui}` 与 `src/__fixtures__/` 目录骨架，`git mv` 后的文件有明确落点；验证：`ls src/` 显示新目录且 `npx tsc --noEmit` 仍通过
- [x] 1.2 实现 `scripts/check-layering.mjs` 的分层白名单与循环依赖（Tarjan）校验，输出违规文件与 import 语句；验证：`node scripts/check-layering.mjs` 在故意加入一条 `infra → ui` import 时非零退出
- [x] 1.3 在同一脚本中实现「生产目录不得含 `*.test.ts`/`*.fixtures.ts`/`*.helpers.ts`」与「生产文件 ≤900 行」两项校验；验证：脚本对当前仓库运行并输出待迁移清单
- [x] 1.4 实现脚本的 Rust 侧校验（`src-tauri/src` 生产文件不得含内联 `#[cfg(test)] mod tests`、行数上限）；验证：对当前后端运行并输出 13 个待迁移文件

## 2. 批①：types / utils / infra 迁移

- [x] 2.1 将 `src/types/*.ts` 按短横线命名归位（`fileTree.ts` → `file-tree.ts`），更新全部消费方 import；验证：`npx tsc --noEmit` 通过
- [x] 2.2 将纯函数模块迁到 `src/utils/`（`pathUtils` → `paths.ts`、`fileSizeTier` → `file-size-tier.ts`、`keyboard`、`native-menu`），修正 import；验证：`npx tsc --noEmit` 通过
- [x] 2.3 将基础设施模块迁到 `src/infra/`（`storage`、`logger`、`error`、`store`、`taskScheduler` → `task-scheduler.ts`、`documentOperations` → `document-operations.ts`、`imageUtils` → `images/`、`theme`），修正 import；验证：`npx tsc --noEmit` 通过
- [x] 2.4 按职责拆分 `imageUtils.ts`（569 行）为 `infra/images/{settings,storage,naming}.ts` + `index.ts`，行为不变；验证：`npm test -- src/infra/__tests__` 全绿且 `wc -l` 各文件 <500
- [x] 2.5 将 `types/utils/infra` 的测试迁到各自 `__tests__/` 并更新 `vitest.config.ts` 的 `include`；验证：`npm test` 用例数与迁移前基线一致

## 3. 批②：editor 层迁移与拆分

- [x] 3.1 将 `src/lib/editor*.ts`、`editor.markdown.*`、`editor.source.*`、`editor.table*`、`editor.katex`、`urlDecorationPlugin` 迁到 `src/editor/`，命名短横线化；验证：`npx tsc --noEmit` 通过
- [x] 3.2 按职责拆分 `editor.extensions.ts`（808 行）为 `editor/extensions/{link,paragraph,table,image,code-block}.ts` + `index.ts`，内容不改；验证：`npm test -- src/editor/__tests__/editor.extensions.test.ts` 全绿且各文件 <500 行
- [x] 3.3 拆分 `editor.ts`（552 行）为 `editor/{session,serialize,mode,caret}.ts`（序列化/保存计划、模式切换、光标锚定各自独立）并保留 `editor/index.ts` barrel 的既有导出面；验证：`npx tsc --noEmit` 通过、`npm test` 全绿
- [x] 3.4 建立 `src/editor/index.ts` barrel，`ui` 与 `main` 只从 barrel 取编辑器能力；验证：`node scripts/check-layering.mjs` 无「绕过 barrel」违规
- [x] 3.5 将 `editor.helpers.ts` 中仅测试使用的部分移入 `src/__fixtures__/`，生产部分保留为 `editor/line-numbers.ts`；验证：`npm test` 全绿且门禁脚本无 fixture 混入违规

## 4. 批③：render / export 迁移与拆分

- [x] 4.1 将 `mermaid*`、`plantuml*`、`katex-*`、`codemirror-*` 迁到 `src/render/`，建立 `render/index.ts` barrel；验证：`npx tsc --noEmit` 通过
- [x] 4.2 将 `documentExport`、`docxExport`、`pdfExport`、`exportSnapshot`、`exportTheme` 迁到 `src/export/`，建立 `export/index.ts` barrel；验证：`npx tsc --noEmit` 通过
- [x] 4.3 按职责拆分 `exportTheme.ts`（624 行）为 `export/theme/{types,fonts,css,base,docx}.ts` + `index.ts`；验证：`npm test -- src/export/__tests__/export-theme.test.ts` 全绿且各文件 <500 行
- [x] 4.4 将 `render/export` 的测试迁到各自 `__tests__/`；验证：`npm test` 用例数保持基线

## 5. 批④：ui 层迁移、端口注入与循环解除

- [x] 5.1 定义 `src/infra/ui-ports.ts` 端口（notify/confirm/openDocument/diagram+table+image 菜单/frontmatter 刷新/降级条），默认实现为结构化 warn + 跳过；验证：新增 `src/infra/__tests__/ui-ports.test.ts` 断言未注册时不抛异常且记录日志
- [x] 5.2 将 `src/components/*.ts` 与 `ui/` 子目录迁到 `src/ui/` 并按短横线命名；验证：`npx tsc --noEmit` 通过
- [x] 5.3 把 `editor/`、`render/`、`export/` 中 16 处 `../components/` 直接调用改为端口调用；验证：`node scripts/check-layering.mjs` 报告 `src/editor|render|export → src/ui` 违规数为 0
- [x] 5.4 在 `src/main.ts` 中唯一装配点 `registerUiPorts(...)` 注册全部端口实现；验证：`npm run build` 通过且手动核对端口实现与迁移前调用等价
- [x] 5.5 按职责拆分 `fileTree.core.ts`（782 行）为 `ui/file-tree/{aria,dom,render,loader,events,workspace,context,core}.ts` + `index.ts`（`core.ts` 收敛为 barrel）；验证：`npm test -- src/ui/__tests__/file-tree.*` 全绿且各文件 <500 行
- [x] 5.6 将 `openFileInEditor` 改为端口注入，消除 `fileTree → sidebar` 反向 import；验证：门禁脚本对 `ui/file-tree/**` 的 sidebar import 违规数为 0
- [x] 5.7 解除 `sidebar.fileops ↔ sidebar.conflict` 互引：把共享动作留在 `fileops.ts`，`conflict.ts` 单向依赖它，`index.ts` 只做 barrel；验证：门禁脚本无循环依赖违规、`npm test` 全绿
- [x] 5.8 按职责拆分 `settings.ts`（543 行）为 `ui/settings/{panel,fields,markup}.ts`（面板逻辑 / 字段读写 / 静态标记）；验证：`npm test -- src/ui/__tests__/settings.test.ts` 全绿
- [x] 5.9 将 `ui` 的测试迁到 `src/ui/__tests__/`，把 `src/main.autosave.test.ts` 迁到 `src/__tests__/main.autosave.test.ts`；验证：`npm test` 用例数保持基线

## 6. 批⑤：入口与配置同步

- [x] 6.1 更新 `src/main.ts` 的全部 import 到新分层路径并保持启动顺序不变；验证：`npm run build` 通过
- [x] 6.2 更新 `tsconfig.json` 的 `include`、`vitest.config.ts` 的 `include` 为 `src/**/__tests__/**/*.test.ts`，确认 `vite.config.ts` 无需 alias 变更；验证：`npx tsc --noEmit` + `npm test` 全绿
- [x] 6.3 更新 e2e 与脚本中对旧 `src/lib`、`src/components` 路径的引用；验证：`grep -rn "src/lib\|src/components" e2e/ scripts/` 无结果

## 7. 批⑥：后端分层、测试外置与拆分

- [x] 7.1 抽出 `src-tauri/src/net/`（`url.rs`、`dns.rs`、`redirect.rs`、`magic.rs`、`redact.rs`、`fetch.rs`），`http.rs` 收敛为门面；原子写与路径安全落在 `commands/files/{atomic,paths}.rs`；验证：`cargo test` + `cargo clippy --all-targets -- -D warnings` 通过且 `http.rs` <500 行
- [x] 7.2 将 `commands/` 按子域拆为 `commands/{files,images,export,settings}/`，`generate_handler!` 只改路径不改命令名；验证：`cargo test` 通过、`npm run tauri build --debug` 编译通过
- [x] 7.3 按职责拆分 `files_image.rs`（1266 行）为 `commands/images/{storage,pending,io,commands}.rs`；验证：`cargo test` 全绿且各文件 <500 行
- [x] 7.4 按职责拆分 `files.rs`（1003 行）为 `commands/files/{paths,atomic,entry,crud,dialogs}.rs`；验证：`cargo test` 全绿且各文件 <500 行
- [x] 7.5 按职责拆分 `export.rs`（779 行）为 `commands/export/{mod,files,macos}.rs`、`menu.rs`（1377 行）为 `menu/{mod,native,recent,dispatch}.rs`；验证：`cargo test` 全绿且各文件 <500 行
- [x] 7.6 将 13 个内联 `#[cfg(test)] mod tests` 迁到同目录 `tests.rs`（模块目录化后为 `<module>/tests.rs`），生产文件只留 `#[cfg(test)] mod tests;`；验证：门禁脚本 Rust 侧测试混入违规数为 0、`cargo test` 全绿

## 8. 批⑦：规范转正、门禁与 CI

- [x] 8.1 将 `docs/archive/cleanup-plan/code-standards.md` 内容升级为 `openspec/specs/code-standards/spec.md`，归档稿改为指向正式规范的说明；验证：`npm run validate:openspec` 通过
- [x] 8.2 将目录树与依赖方向写入 `openspec/specs/source-layering/spec.md` 并同步 `openspec/specs/architecture.md` 的项目结构一节；验证：`openspec show source-layering --type spec` 内容与代码实际结构一致
- [x] 8.3 在 `openspec/specs/INDEX.md` 登记两个新规范并更新任务路由表中的源码路径；验证：INDEX 自检命令（`for f in openspec/specs/*/spec.md; do grep -q ...`）无输出
- [x] 8.4 把四项校验接入 `.github/workflows/ci.yml`（分层、行数、测试分离、Rust 测试分离）；验证：本地 `node scripts/check-layering.mjs` 退出码为 0，CI 配置中该步骤存在
- [x] 8.5 在 `AGENTS.md` 增加「新增代码自检清单」小节（分层落点、barrel、端口注入、行数、测试位置）；验证：`AGENTS.md` 含该小节且与规范条目一致

## 9. 集成校验

- [x] 9.1 全量门禁：`npx tsc --noEmit`、`npm run build`、`npm test`、`npm run validate:openspec`、`bash scripts/check-archive-synced.sh`、`node scripts/check-layering.mjs` 全部通过；验证：命令退出码均为 0
- [x] 9.2 后端门禁：`cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test` 全部通过；验证：命令退出码均为 0
- [x] 9.3 行为回归：`npm test` 用例数与迁移前基线一致，无测试被静默漏收集；验证：对比基线用例数输出
