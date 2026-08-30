# P4B-ITEM: task checkbox（task 7.4 widget pilot）

> P4B.md 要求「每个 construct 必须复制本记录为 `P4B-<construct>.md`」；本文件即为 task checkbox 项。
> 单项裁决 `P4B-ITEM-taskCheckbox-GO/NO-GO` 由主会话在 Reviewer + 人工验收 + Program Owner 齐备后记录，
> 执行流不自我批准。

## Identity

| 字段 | 值 |
| --- | --- |
| Construct | task checkbox（`- [ ]` / `- [x]`） |
| Flag | `taskCheckbox`（`src/lib/lossless/cohortFlags.ts:170` `isTaskCheckboxEnabled()`） |
| **Default** | **OFF**（生产默认关闭，与全部 P4B flag 一致） |
| Maturity | **pilot** —— 7.4 试点项，未申请默认开启 |
| Fallback | flag OFF 或 widget 失败 → `source-fallback` owner，marker 以源码呈现，可正常编辑 |
| Run ID | `20260830-113140-p4b-clipboard-b91de0e`（最新全 gate run） |
| Commit | `b91de0e`（最新，仅补证据）；历史 `7869de8`（harness 修正）/ `ec718b4`（证据记录） |
| Branch | `test/issue-255-lossless-byte-contract` |

## 验收要求（来源）

- `tasks.md` §7.6：局部 patch、source-based clipboard、单一 History、read-only。
- `design/phases/P4B-widgets-cohorts.md`：每个 cohort 须通过 selection、Home/End、Shift+Arrow、
  Select All、clipboard、CJK/Japanese composition、emoji boundary、空 construct、input rule、
  Undo 落点、viewport 重建、Source fallback。

## 证据

### 单元测试（C01，EXIT=0；16 files / 433 tests）

| 文件 | 与该项的关联 |
| --- | --- |
| `src/lib/lossless/widgets/p4bWidgets.test.ts`（26） | widget 渲染与局部 patch |
| `src/lib/lossless/widgets/protocol.test.ts`（16） | widget protocol / stale identity |
| `src/lib/lossless/commandMatrix.test.ts`（38） | 键盘与选择矩阵 |
| `src/lib/lossless/structuralInteraction.test.ts` | 7.2a ADR 结构交互矩阵 |
| `src/lib/lossless/renderOwnerRegistry.test.ts`（33） | owner 唯一性与父子仲裁 |
| `src/lib/lossless/cohortFlags.test.ts`（11） | flag 读取与回滚 |

### 桌面 E2E（C15，EXIT=0；30 passing，真实 Tauri WebKit）

直接命中本项的用例：

- `task checkbox flag OFF/ON exposes DOM + ARIA and Space toggles one local patch`
- `task checkbox read-only is disabled and cannot change source`
- `keyboard-only task navigation is fail-safe: supported keys commit, editing keys never leak`

共享底座用例（同 session 内覆盖本项）：

- `widget failure injection falls back to exact source and flag rollback removes controls`
- `three product themes and synthetic 200% CSS-zoom stress keep widgets visible and focusable`
- `preview projection can be disposed/recreated and cleanup leaves no widget flag residue`
- `toolbar HTML export uses lossless source and never serializes widget DOM`
- `Source↔Preview roundtrip preserves source, shared history, dirty state, and file bytes`

### 字节合同（C10，EXIT=0）

L0 `24 added / 23 removed`、L1 `95 added / 93 removed`，`"pass": true`、`"failed": []`。
widget 为 decoration-only，不进入 `EditorState.doc`，故不参与字节合同。

## 已知缺口

1. **本项区域的选区 copy 仍无证据**（全局缺口已闭合，本项未闭合）：
   2026-08-30 的 run `20260830-113140-p4b-clipboard-b91de0e` 新增了选区 copy/cut 断言，
   但用的 fixture 是 `p4b-widget-fence.md`（fence）。**「选中含 task checkbox 的区域 → Cmd+C
   → plain-text 为完整 Markdown source」仍无断言** —— 断言存在 ≠ 本 construct 被覆盖，
   不能因为全局缺口关闭就顺手把本项也勾掉。
2. **CJK/Japanese IME 在 task checkbox 邻域的证据**：7.3 的真实 IME 基线只覆盖
   `# marker` / `> marker` 两处（heading / blockquote 邻域），**未覆盖列表 marker 旁的
   task checkbox**。列表 marker 与 IME 的交互属 P6 `9.2` 范围，此处如实记为未验证。
3. **emoji boundary 未单列**：fixture `- [ ] widget task 🚀` 含 emoji，通过
   `② emphasisStrikeInlineCode` 间接覆盖 UTF-16 安全，但不是本项的专门断言。

## 裁决

| 角色 | 结论 |
| --- | --- |
| AI 编码验证 | PASS（C01 / C15 / C10 全绿） |
| 独立 Reviewer | **PENDING** |
| 人工验收 | **ACCEPT** —— `20260830-122241-p4b-human-acceptance-1f1bd3c`（视觉/键盘/Undo/export 实测）。注意：本项的**选区 copy 仍未闭合** —— 人工验收的 pasteboard 端到端用的是 fence fixture，未覆盖本 construct 区域 |
| `P4B-ITEM-taskCheckbox-GO/NO-GO` | **PENDING —— 不自我批准** |
