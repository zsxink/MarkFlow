# RUN.md — P3 收尾 closeout：干净重验 + 隐藏缺口审计 + 5.11/5.13 人工物料

- Run ID: `20260829-p3-closeout-90081fc`
- Date: 2026-08-29
- HEAD: `90081fcb2f55ab1c91e6ce3a0c9c6b76f55f304c`（branch `test/issue-255-lossless-byte-contract`；
  父提交 `b77c7f0` = Reviewer GO 候选基线，产品代码与 `70f314c` Reviewer GO 候选一致）
- 性质：closeout 复验 + 纠偏。全部命令在本会话 fresh 执行于干净 checkout
  `/private/tmp/p3-clean-verify/wt`（worktree，detached，`git status` clean，`npm ci` 全新
  node_modules，Rust 全新 `target/`），非引用历史日志。环境实测值见同目录不可变
  `ENVIRONMENT.md`（SHA-256 `8056106eb0374d72446f9557345b0df553dee67336bd27a18a61e187e5756b89`）。

## 0. 两轮结构与纠偏说明

本轮 closeout 把 gate 集扩展到 VALIDATION-PROTOCOL §3 的完整清单（在历史 P3 gate 之上
增加 `cargo fmt --check` 与 `cargo clippy --all-targets -- -D warnings`）：

- **第 1 轮（诊断轮，`b77c7f0`）**：历史 gate 清单全部 PASS（npm test 42 files/519、
  tsc、build、byte-contract 95/93、core 93、tauri 151、characterization 9、openspec、
  archive-synced、桌面 E2E 30 用例）；新扩 gate 发现 2 个红灯：
  1. `markflow-core` `cargo fmt --check` FAIL（`session.rs` 格式漂移，历史遗留）；
  2. `src-tauri` `cargo clippy -D warnings` FAIL（4 项 lint：`too_many_arguments`、
     `missing_const_for_thread_local`×2、`needless_question_mark`，均为历史遗留，
     历史 P3 gate manifest 从未包含 clippy，非本轮新引入的破坏）。
- **纠偏**：`90081fc`（`style: 修复 core cargo fmt 漂移 + tauri clippy 4 项 lint（无行为变更）`）——
  纯格式/allow 属性/等价改写，Rust 93+151 测试复验通过。
- **第 2 轮（最终轮，`90081fc`）**：下表 18 个 gate 全部 fresh 重跑，全绿。
- 第 1 轮原始日志存档于 `gates/round1-b77c7f0-diagnostic/`（历史 run 均未改写）。

## 1. 最终轮全 gate 结果（HEAD=90081fc，干净 checkout）

| # | Gate | 命令 | 结果 |
| --- | --- | --- | --- |
| 1 | vitest | `npm test` | PASS — **42 files / 519 tests**，0 failed |
| 2 | tsc | `npx tsc --noEmit` | PASS（exit 0） |
| 3 | build | `npm run build` | PASS |
| 4 | byte-contract | `npm run test:byte-contract` | PASS — fixture verify stable（changed=[]），L0 self-check 正 24/24 负 23/23，L1 self-check 正 **95/95** 负 **93/93** missed=[] |
| 5 | characterization | `npm run test:characterization` | PASS — 2 files / 9 tests（legacy 回退路径证据） |
| 6 | openspec | `npm run validate:openspec` | PASS |
| 7 | archive-sync | `bash scripts/check-archive-synced.sh` | PASS |
| 8 | core fmt | `cargo fmt --check`（markflow-core） | PASS（90081fc 修复后） |
| 9 | core clippy | `cargo clippy --all-targets -- -D warnings` | PASS |
| 10 | core rust | `cargo test`（markflow-core） | PASS — 37+18+4+3+17+8+6 = **93 passed, 0 failed** |
| 11 | tauri fmt | `cargo fmt --check`（src-tauri） | PASS |
| 12 | tauri clippy | `cargo clippy --all-targets -- -D warnings` | PASS（90081fc 修复 4 项 lint 后） |
| 13 | tauri rust | `cargo test`（src-tauri） | PASS — **151 passed, 0 failed** |
| 14 | E2E lossless | `node e2e/run.mjs lossless` | PASS — **10 passing**（P1B lifecycle 6 + P2 live-preview 4，含 100 次模式切换，真实 Tauri app + WebKit 605.1.15） |
| 15 | E2E acceptance | `node e2e/run-lossless-acceptance.mjs` | PASS — **15 passing** |
| 16 | E2E p0s | `node e2e/run.mjs p0s` | PASS — **4 passing**（零编辑两 tick、立即 Cmd+S、A→B discard、干净 Ctrl+S） |
| 17 | E2E regression | `node e2e/run.mjs regression` | PASS — **1 passing** |
| 18 | npm ci | `npm ci` | PASS（全新 node_modules，patch-package 应用） |

逐 gate 原始日志与退出码：`gates/gate-summary.txt` + `gates/*.log`；SHA-256 见 `manifest.sha256`。

## 2. 隐藏缺口审计（tasks 5.1–5.13 对照 design）

对默认 flag（losslessCoreSession=ON、codemirrorLivePreview=ON）可达路径逐点静态走查：

| # | 审计点 | 结论 | 证据位置 |
| --- | --- | --- | --- |
| 1 | clearActiveDocument 不触碰隐藏 PM | **无缺口**（Reviewer F2 修复在位） | `src/components/activeDocument.ts:34-55`：lossless 分支 dispose binding（flush/close），`setMarkdown('')` 仅 legacy 分支；收尾 `setEditable(true,false)` 不含正文 update（P0S 保证） |
| 2 | 外部删除脏文档重存用 binding logical text | **无缺口**（Reviewer N1 修复在位） | `src/components/sidebar.conflict.ts:46-60`：`binding.logicalText` + `bindPersistedAfterResave`；`getMarkdown()` 仅 legacy 分支 |
| 3 | 图片面板用点击时捕获的 source range | **无缺口**（Reviewer F3 修复在位） | `src/lib/lossless/imageEditing.ts:22-36`：dblclick 时 `findImageAt` 捕获 exact range 并传给面板；confirm/delete 只动该 range；src+alt 同一 transaction；mount 于 `openLosslessDocument`（integration.ts:224） |
| 4 | read-only/stats/outline/statusbar 不读隐藏 PM | **无缺口** | `editor.stats.ts` 三个函数均先读 `getActiveLosslessBinding().editor.view`；`outline.ts:45` lossless 分支优先（headings + 点击跳转）；`sidebar.fileops.ts setReadOnly` 同时设置 binding 与 hidden surface，但只触 editable 状态、无正文 |
| 5 | 复杂 construct exact source fallback 可编辑/可复制/可保存 | **无缺口** | `projection.ts classifyNode` 白名单（heading/strong/emphasis/strike/inlineCode/link/quote/listItem/fence）之外（table/frontmatter/HTML/footnote/reference/图片等）返回 null → 保留 raw source；CM 原生编辑/复制/保存；`commandMatrix.test.ts` table/image Enter/Backspace 均为 plain CM 文本语义 |
| 6 | legacy ProseMirror 显式 flag + 与 lossless owner 严格隔离 | **无缺口** | `flag.ts`：默认 ON，唯一 opt-out `localStorage['markflow.losslessCoreSession']==='0'`；`registry.ts` 单一 active binding + path identity；lossless 打开失败仅非恢复类错误回退 legacy（恢复类 `showStartupRecoverySurface` 阻断，永不构造可写 legacy owner）；`flagRollback.test.ts` 4 项覆盖默认/双 opt-out |
| 7 | serializer / normalizeImageMarkdown / getMarkdown / setMarkdown 残留路径 | **无缺口** | 产品代码全部调用点：`activeDocument.ts:46`（legacy 分支）、`sidebar.fileops.ts`（save/save-as/reload/open 的 legacy 分支，lossless 均在前置短路）、`sidebar.conflict.ts:62`（legacy 分支）、`editor.ts` 自身（legacy 编辑器内部）；toolbar/keyboard/linkDialog/image/export 均先路由 lossless view；`lifecycle.test.ts` 调用审计断言 lossless 打开/编辑/保存/reload/close 不触 serializer |
| 8 | 新建/untitled 文档 owner | **无缺口** | `newFileDialog.ts`：先 `createFile(path,'')` 落盘再 `openFileInEditor` → lossless 路径；无内存 untitled owner |
| 9 | 观察：默认路径无大文件只读预览门槛 | **记录为体验差异，非数据完整性问题** | legacy 的 huge-file tier dialog（`sidebar.fileops.ts:389-418`）只在 legacy 分支；lossless 直接打开大文件（CM + Core 承载）。建议 Program Owner 在 5.11 工作流中用大文档实际体验并记录 |
| 10 | 观察：`codemirrorLivePreview='0'` 时强制 Source-only | **符合设计** | `modePreference.ts` + `flagRollback.test.ts`：Live Preview flag off 时 preferred mode 恒为 source |

未发现任何新的数据完整性缺口（无打开即 dirty、无 serializer save、无双 owner 路径）。
无需为审计项建立代码纠偏；本轮唯一纠偏为 §0 的 fmt/clippy。

## 3. 5.13 默认 flags L0/L1 自动化清单（本轮全部 fresh 重跑通过）

以下测试在**默认 flags（两个 flag 均无 localStorage 覆盖）**下运行且全绿，供人工照跑：

| 载体 | 数量 | L0/L1 覆盖 |
| --- | --- | --- |
| `src/main.lifecycle.guard.test.ts` | 19 | L0：default-on 零编辑 open → 两个 autosave tick → 干净 Ctrl+S → 关闭，LF/CRLF/CR/Mixed/BOM × tail0-3，无写盘/hash/length/mtime 不变；read-only↔editable 切换不 dirty；A/B 隔离；reload 干净。L1：真实 user edit 进入 dirty 并持久化 revision |
| `src/lib/lossless/lifecycle.test.ts` | 23 | L0：零编辑两 tick 无写 + 调用审计（无 setMarkdown/getMarkdown/normalizeImageMarkdown/PM serializer）。L1：real edit→save 写一次、写盘期间继续输入保持 dirty、reload、lost commit/write reconcile、save-as、paste EOL provenance（CRLF/CR 泄漏矩阵）、renderer 失败不阻塞 |
| `src/lib/lossless/flagRollback.test.ts` | 4 | 回滚路径：默认=lossless ON；`losslessCoreSession='0'` → legacy；`codemirrorLivePreview='0'` → Source-only；双 opt-out → 全 legacy |
| `npm run test:byte-contract` | 正 95 + 负 93 | L0/L1 harness self-check：未编辑 bytes 完全回放、局部编辑 prefix/suffix/存活 span 保真 |
| desktop E2E `run.mjs lossless` | 10 | 真实 app：打开—编辑—保存—重开逐 fixture byte 比对 + 零编辑 100 次模式切换 byte 合同 |
| desktop E2E `run.mjs p0s` | 4 | 真实 app（autosave 开）：零编辑两 tick、立即 Cmd+S、A→B discard、干净 Ctrl+S |
| desktop E2E acceptance + regression | 15 + 1 | P2 acceptance 全套 + 真实后端导出 |

注：`npm run test:characterization`（9 项）驱动的是 legacy 路径，作为回退通道证据保留，
不计入默认 flags 面。上述命令即 5.13 人工复验的「照做脚本」；任何一项出现打开即
dirty / 写盘 / serializer save → 立即关闭默认 flag（task 5.13 既定规则）。

## 4. 交付给 Program Owner 的人工物料

- **5.10**：`validation/minimum-parity-matrix.md`（自动化证据列已填、Program Owner 结论列
  保持 PENDING，本 run 未触碰）。
- **5.11**：`validation/manual-acceptance-p3-real-workflow.md`（新建）——真实日常工作流
  叙事式证据清单 + legacy 回退原因记录 + 数据完整性 kill-switch。
- **5.12**：`validation/manual-acceptance-p3-checklist.md`（既有 12 节）+ 三平台 smoke
  （Windows/Linux 仍 BLOCKED，需登记设备）+ 30 分钟连续编辑观察。
- **5.13**：本文 §3 清单即照跑脚本。

## 5. 结论与边界（不代替人工签署）

- 机器可验证面在干净 checkout 上**全部重跑通过**（18/18 gate），且比历史 run 多覆盖
  fmt/clippy 两个协议 gate；两处历史遗留红灯已以无行为变更方式修复（`90081fc`）。
- 静态审计未发现默认路径的数据完整性缺口或 serializer 残留路径。
- **本 run 不构成 P3 GO，也不构成 default-on 获批**：`losslessCoreSession` /
  `codemirrorLivePreview` 默认入口仍为「未验收候选」。5.10 parity 逐行签署、5.11 真实
  工作流证据、5.12 桌面/三平台验收、5.13 人工复验必须由 Program Owner 完成；矩阵
  结论列保持 PENDING 待人工填写。
- 依赖人工项：真 IME composition、Redo 组合键（WebKit WebDriver 注入限制）、
  accessibility/screen-reader、30 分钟连续观察、三平台（Windows/Linux 设备未登记）。
