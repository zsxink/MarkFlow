# P2 启动提示词（直接粘贴到新会话）

## 背景

这是 MarkFlow（Tauri v2 + TypeScript + Vite + ProseMirror/CodeMirror 桌面 Markdown 编辑器）的 **Issue #254 /** `refactor-lossless-live-preview` umbrella change 的 **Slice 1B / P2 阶段**：**单一 CodeMirror Surface 与基础 Live Preview**。

当前分支 `test/issue-255-lossless-byte-contract` 已有完整的 P0/P0S/P1A/P1B 纵向闭环。P1B（无损 Source 纵向闭环）已通过三轮独立复核（最后一轮是我在 `20260817-053048-independent-review-a16e575` 对候选 `a16e575` 的独立 Reviewer #3），但 **Program Owner 人工验收尚未完成**——这是 P1B 剩余的唯一 gate。

本项目使用 **OpenSpec** 管理规范；执行受 `tasks.md` 顶部的“执行约束”管辖（Program Owner 已批准在**单一分支 + umbrella change 内连续完成** P0 corrective、P0S、P1A–P7，并在最后执行 P5；不新建分支/issue/child change/阶段 PR，但每个 Slice 仍需独立 commit checkpoint、evidence run、独立 Reviewer、人工验收与 Go/No-Go）。

## 第 0 步：先确认 P1B 遗留人工验收

tasks.md 的 Slice 1B 任务 **3.11** 要求通过并经人工验收后记录 Slice 1B Go checkpoint，且 **不归档 umbrella change**。在开始 P2 编码前，请：

1. 确认分支当前干净（不应有未提交产物；若 P1B review evidence 已归档则 `git log` 应有 `a16e575` 与 `8bbcb79`）。
2. `validation/phases/P1B.md` 用 **nitpick**（一眼扫过，不必深读）确认 starred 项仍为 NOT STARTED / 待人工：**Program Go/No-Go**、人工验收清单。
3. **MUST 先拿人工验收记录**：按 `validation/phases/P1B.md` 的人工清单，把候选、flags、fixture 与操作步骤准备好，请 Program Owner / 你在新会话中执行验收清单。验收结果写入 `validation/phases/P1B.md` 的人工验证记录。**验收未完成前不要宣称 P1B 完成**；若验收发现问题，先建立 corrective run。

> 若验收通过，更新 `phases/P1B.md` 的人工结论与 Program Go/No-Go 后，再进入 P2 编码。

## P2 范围（来自 `design/phases/P2-live-preview-surface.md`）

- 单一 EditorView（不再 WYSIWYG/Source 两个 surface），用 base/mode/theme/readOnly/projection compartments；
- 本地 decorations 呈现 heading、strong、emphasis、strike、inline code、link、quote、list、fence；
- marker 默认弱化 + active range reveal；
- projection invalidation closure（只失效目标 closure）；
- CM selection/affinity/ChangeDesc mapping 保持；Home/End/Arrow/Shift+Arrow/Select All/copy、CJK/emoji/ZWJ/IME；
- outline/stats/status/search/settings 接 active binding；
- projection debug state 与源 fallback；
- **边界**：不默认隐藏 marker（可编辑）、不实现复杂 widgets、不依赖 Core IR。关闭 `codemirrorLivePreview` 即回滚到同一 lossless Source/Core session。

## 必须执行的验证清单（P2）

**编码前** 创建 GitHub Issue 或直接使用现有 **#255** 关联（执行约束允许单一分支连续完成，无需新建 issue/branch）。所有改动在分支上完成；commit 遵守项目 `.claude/rules/git-commit.md`（`type: 中文描述`，关联 issue）。

**开工前先读**（这是本项目最重要的可运行知识，别跳过）：
- `CLAUDE.md`、`.claude/rules/*`（branch-first、git-commit、css-layout、line-numbers、调试规则）
- `.claude/memory/MEMORY.md`（踩坑记录）
- OpenSpec 工作流 `/opsx:explore`、`/opsx:propose`、`/opsx:apply`
- 若仓库有 `.codegraph/`，优先用 `codegraph explore` 定位代码，避免盲目 grep

**通用 gate**（每个阶段/每个候选都要跑并记录）：`npm test`、`npx tsc --noEmit`、`npm run build`、`cargo test --manifest-path markflow-core/Cargo.toml`、`cargo test --manifest-path src-tauri/Cargo.toml`、`npm run test:byte-contract`、`npx openspec validate refactor-lossless-live-preview --strict`、`npx openspec validate --all`、`npm run test:e2e:build` + 四条桌面 WebKit E2E（`node e2e/run.mjs lossless|smoke|regression|p0s`，用 embedded WebDriver，无需 `tauri-driver` 在 PATH）。

**P2 专属 AI 验证**（写进证据）：
1. Source↔Live Preview **100 次切换**，EditorView **identity 不变**；
2. 每次 mode transaction `docChanged=false` 且**不进 History**；
3. selection、direction、scroll anchor、focus、composition、dirty、revision 在切换前后不变；
4. 每个基础 construct 的语义 class/decoration 与底层 source 字符同时存在（不只断言“文本存在”）；
5. marker 在 inactive/active/range/composition 下状态正确；
6. projection 只失效目标 closure；
7. malformed/unknown 文档精确 Source fallback；
8. projection exception/timeout/stale 不影响输入与保存；
9. CJK/emoji/ZWJ selection mapping；
10. Home/End/Arrow/Shift+Arrow/Select All/copy；11. light/dark/sepia、zoom 200%、read-only；
12. Large/Huge 文档降级；
13. **autosave 实际开启**时，干净文档切换模式 100 次并等两个 tick：dirty=false、save count=0、hash/length/mtime 不变、关闭无提示；
14. unit、adapter、desktop semantic E2E、visual snapshot 全输出证据；byte hash before/after。

**独立 Reviewer 验收**：projection extension 不 dispatch doc changes；mode switch 不重建 EditorView；source fallback 可局部清理 stale widget/decoration；selection 未从 DOM textContent 反推；基础投影不等待 Core IPC；重跑真实 desktop semantic E2E。

**人工验证**：真实 UI 语义、marker 可编辑、跨 construct 拖选复制为 source、IME 邻 marker 输入/Undo/Redo、连续切模式不跳 selection/scroll/focus、三主题/缩放/窄窗口、projection failure 回退且可保存、malformed 不空白、全新 byte fixture 零编辑切换/等待/关闭无 dirty/写盘、编辑手感 Accept/Reject。

## 流程约束（务必遵守）

- 每次运行从 `validation/templates/RUN-RECORD.md` 复制记录，写入 `validation/evidence/P2/<run-id>/RUN.md`，同目录写不可变 `ENVIRONMENT.md` 并算 SHA（critical：evidence 不可变，无 hash 不可弃）。
- `RUN.md` 中分开保存每个命令的输出，不混成无法判断退出码的日志。
- 阶段结论只可由 AI gate + 独立 Reviewer + 人工验收 + Program Owner Go/No-Go **四者齐备**才勾选完成。
- Reviewer 使用 fresh context，从干净环境读取同一 commit，静态检查 diff，重跑关键命令，报告写入对应 run 的 `REVIEW.md`。不要在同一个会话里又实现又自证。
- 修复请在 P1B 遗留验收确认后进行；任何 corrective 都建立新 run-id，不篡改历史 run。
- 所有证据保留在 umbrella change，不能只留在主目录。

## 先从这开始

1. `git status` 确认分支干净、当前 HEAD 为 `8bbcb79`（若已推进则记下）。
2. `npx openspec validate refactor-lossless-live-preview --strict` + `npm test` 快速确认基线绿。
3. 读 P2 设计 `design/phases/P2-live-preview-surface.md` 与验证 `validation/phases/P2.md`（本提示词是外挂要点的速记，权威定义以这两个文件与 `tasks.md` 3.11 为准）。
4. 确认 P1B 人工验收状态；若未验收，先完成并记录，再进 P2 编码。
5. 用 `/opsx:explore` 或 codegraph 定位模式切换、`EditorSurfaceBinding`、mode compartments、CM decorations 的现状，形成 P2 实施计划，再 `/opsx:apply` 逐步实施。
