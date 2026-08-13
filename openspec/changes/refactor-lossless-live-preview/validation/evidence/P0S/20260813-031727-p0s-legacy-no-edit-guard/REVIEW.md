# P0S Legacy 零编辑写盘安全止血 — 独立 Reviewer 复核报告

> **Review 对象 commit**：`ed96f4e04125c23adfb32e6a5dd627946eabfe71`（HEAD）+ 工作树 dirty。
> 复核以磁盘上代码为准，不采信实现 agent 摘要。

## 1. Identity

- **分支**：`test/issue-255-lossless-byte-contract`
- **HEAD**：`ed96f4e04125c23adfb32e6a5dd627946eabfe71`
- **工作树状态**：dirty。修改：`src/lib/editor.state.ts`、`src/lib/editor.init.ts`、`src/lib/editor.ts`、`src/components/sidebar.fileops.ts`、`src/components/activeDocument.ts`、`src/main.ts`、`src/lib/editor.state.test.ts`、`src/main.autosave.test.ts`、`src/components/sidebar.fileops.test.ts`、`tests/byte-contract/legacy-open-autosave.characterization.test.ts`、`tests/byte-contract/pm-tail-newline.characterization.test.ts`、`openspec/.../validation/README.md`、`validation/ENVIRONMENT.md`、`validation/phases/P0S.md`、`tasks.md`。未跟踪新增：`src/main.lifecycle.guard.test.ts`、`openspec/.../validation/evidence/P0S/`、`manual-acceptance-p0s-checklist.md`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`。
- **复核时间**：2026-08-13（Reviewer fresh context）。

> 注：复核过程中工作树出现并发改动（`validation/README.md`、`pm-tail-newline.characterization.test.ts` 等在我读取后被写入）。本报告全部基于复核时磁盘上的最终代码状态；所有重跑命令均在该最终状态下执行并通过。

## 2. 静态审查结论

### A1. `src/lib/editor.state.ts` — **PASS**
| 检查项 | 结论 | 关键行号 |
|---|---|---|
| `TransactionOrigin` 类型存在 | PASS | L17-22（`userTransaction` / `hydration` / `readOnlySync` / `reloadSync` / `unknown`） |
| `userRevision` / `persistedRevision` 分离 | PASS | L36-37；旧 `revision` 字段已删除 |
| `markProgrammaticContent` 语义 | PASS | L133-137：仅置 `programmaticUpdate=true`，不 bump revision；origin 仅诊断用途 |
| `resetDocumentRevision` | PASS | L143-146：两个计数归 0（clean 定义） |
| `markDocumentPersistedRevision` | PASS | L153-160：`persistedAtSave !== userRevision` 时返回 false 保留 dirty；相等才推进 persistedRevision |
| `hasUnpersistedUserChanges` | PASS | L163-165：`userRevision > persistedRevision` |

### A2. `src/lib/editor.init.ts` — **PASS**
- `onUpdate` dirty-check（L102-113）不再 serializer 回比；改为 `if (!programmaticUpdate) { bumpRevision(); store.setState({ dirty: hasUnpersistedUserChanges() }) }`。
- `programmaticUpdate` 守卫仍在（L109）。
- 旧的 `getMarkdown()` / `getSourceContent()` serializer 比较已整体移除（diff 确认）。

### A3. `src/lib/editor.ts` — **PASS**
- `markDocumentPersisted`（L100-123）：`lastPersistedMarkdown` 仅作 legacy 存储（L105），dirty 只由 `markDocumentPersistedRevision` / `hasUnpersistedUserChanges` 决定；不再调用 `getMarkdown()` 回比（diff 确认旧 content-based sanity check 已删）。
- `setMarkdown`（L125-151）：`resetDocumentRevision()`（L139）→ `programmaticUpdate=true`（L140）→ `setContent`（L141）→ `programmaticUpdate=false`（L145）→ 显式 `store.setState({dirty:false})`（L146）。
- source-mode dirty-check（L195-196）：`bumpRevision()` + `hasUnpersistedUserChanges()`，revision 驱动。

### A4. `src/components/sidebar.fileops.ts` — **PASS**
- `setReadOnly`（L365-378）：`editor.setEditable(!readOnly, /* emitUpdate */ false)`（L374），`setSourceReadOnly` 同步（L377）。
- `saveActiveDocument` clean-session guard（L118-129）：位于**任何 `getMarkdown()`/write 之前**；`!hasUnpersistedUserChanges()` 直接 `return 'skipped'`（L123-129）。该分支不调用 `getMarkdown()`、不调用 `writeFile`。

### A5. `src/components/activeDocument.ts` — **PASS**
- `clearActiveDocument`：`editor.setEditable(true, /* emitUpdate */ false)`（L40）。

### A6. `src/main.ts` — **PASS**
- `runAutoSaveTick` 双检查（L200）：`if (!isDocumentDirty() || !hasUnpersistedUserChanges()) return;` — store dirty 与 revision 模型双保险。

## 3. 红线检查结论

| 红线 | 结论 | 证据 |
|---|---|---|
| 不把 serializer 输出作为 dirty baseline 掩盖问题 | PASS | `lastPersistedMarkdown` 现为**只写不读**（仅 L105/L149 赋值，无消费方）；dirty 全部 `hasUnpersistedUserChanges()`。`getMarkdown()` 仅出现在真实写路径（save/save-as/conflict 写）与 mode-switch 序列化，不在任何 dirty 判定中 |
| 不扩大 `trailingNewlines` 元数据 workaround | PASS | 仅 editor.ts L83/L90（getMarkdown 重追加）与 L131（setMarkdown 捕获），scope 与 P0 相同，无新用途 |
| 不全局关闭 autosave | PASS | `DEFAULT_SETTINGS.autosave=true`、`autosaveInterval=10000`（settings.ts L62-63）；`startAutoSave`（main.ts L218-227）仍默认启用；两个生命周期测试均显式断言该默认 |
| transaction origin 不漏真实用户编辑 | PASS | `bumpRevision()` 仅两处：editor.init.ts L110（`onUpdate` 且 `!programmaticUpdate` 守卫）与 editor.ts L195（source-mode 真实编辑，受 editor.source.ts L126 updateListener 的 `programmaticUpdate` 守卫）。两处都不会被 hydration/readOnlySync 触发 |

## 4. 重跑命令退出码表

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npx vitest run src/main.lifecycle.guard.test.ts` | 0 | 17/17 通过（含 10 fixture 零编辑矩阵、readOnly 切换、A/B 切换、reload、clean Ctrl+S、真实编辑 dirty/save、L1 文件内容守卫） |
| `npx vitest run src/lib/editor.state.test.ts src/main.autosave.test.ts src/components/sidebar.fileops.test.ts` | 0 | 46/46 通过（28+8+10） |
| `npm run test:characterization` | 0 | 9/9 通过；`pm-tail-newline` 4 个用例仍断言 L1 失败（`oracleTail="\r\n\r\n"` vs `savedTail="\n"`、`oracleTail="\r"` vs `savedTail=""`、`utf8-lf-tail3` stale metadata 重加 3 个换行），**未转绿** |
| `npx tsc --noEmit` | 0 | 0 errors |
| `npm run build` | 0 | build 成功（仅 chunk-size warning，非错误） |

零编辑路径关键实证（来自重跑日志）：
- `[p0s] utf8-crlf-tail3: dirty=false/false/false/false rev=0/0 saves=0/0`，`firstDiffByte=-1`，mtimeDelta=0.0ms — 零编辑打开不 dirty、不 write、字节不变。
- `[p0s-user-edit] revAfterEdit=1 mtimeChanged=true` — 真实用户 transaction 仍 bumpRevision、dirty、save、persist。
- clean Ctrl+S 用例：`getMarkdown` spy 未被调用、writeCount=0、mtime 不变。

## 5. 最终结论

**PASS。**

P0S legacy 零编辑写盘安全止血在静态检查与动态重跑两个维度均满足契约：

1. 零编辑（open / hydration / readOnly 切换 / reload / 模式切换）不 bump `userRevision`，不 dirty，不 serializer，不 write — 17/17 绿色回归 + 5/5 characterization 实盘链路复验。
2. 真实用户 transaction 仍能 dirty / save / persist（revision 驱动闭环）。
3. L1 serializer 失败 characterization 保持红色（`pm-tail-newline` 仍断言 L1 violation），P0S 未宣称编辑后 byte-to-byte 修复。
4. 所有红线（serializer-baseline、trailingNewlines 扩容、autosave 关闭、origin 泄漏）均未触发。

### Findings

- **P0/P1**：无。
- **P2（非阻断，建议后续清理）**：
  1. `markProgrammaticContent(origin)` 与 `TransactionOrigin` 已导出但调用方为零（代码直接操作 `getDocumentState().programmaticUpdate`，且 `void origin`）。属预留 API，语义正确但当前为死代码，建议后续接入或删除以免误导。
  2. `documentState.lastPersistedMarkdown` 已无读取方（仅赋值），注释称 "retained for reads" 与实际不符，可随 P2 清理。
  3. `pm-tail-newline.characterization.test.ts` `beforeEach` 使用 `d.userRevision=0; d.persistedRevision=0`（已修复旧 `d.revision` 残留）；`setMarkdown` 内部 `resetDocumentRevision()` 使该设置实际冗余，但无害。

---

## Addendum（2026-08-13，实现 agent 针对性改动后的复核确认）

**对象改动**：`src/lib/editor.ts` `setMarkdown` 中，原来裸设置 `getDocumentState().programmaticUpdate = true`（配合 `resetDocumentRevision()`）改为调用 `markProgrammaticContent('hydration')`（现 editor.ts L139-141），复位 `getDocumentState().programmaticUpdate = false`（L146）保持不变。`markProgrammaticContent`（editor.state.ts L133-137）内部置 `programmaticUpdate = true` 且不 bump `userRevision`。

**复核确认**：

1. **不破坏「hydration 不 bump userRevision」**：`markProgrammaticContent('hydration')` 仅置 `programmaticUpdate=true`，不调用 `bumpRevision`，与旧裸赋值逐字节等价。`resetDocumentRevision()`（L139）仍在 setContent 前置零。Tiptap `setContent` 默认 `emitUpdate=false`，hydration 本就不触发 onUpdate，`programmaticUpdate` 旗标是纵深防御；其语义窗口与旧实现完全一致（setContent 前置 true，L146 复位 false）。

2. **无「真实用户编辑漏标」或「programmatic 误标」风险**：
   - 该改动仅影响 `setMarkdown` 的 hydration 路径；`bumpRevision()` 的两处真实用户入口（editor.init.ts L110 的 `onUpdate` dirty-check、editor.ts L195 的 source-mode 编辑）未被触碰。
   - `markProgrammaticContent` 只被 `setMarkdown` 调用（唯一非 test 消费方）；`switchToWysiwyg` 仍用等价裸赋值（editor.ts L215/L219），非本次改动、行为不变，无新增误标面。
   - 未引入任何把用户 transaction 标为 programmatic 的新路径。

3. **不记为 P0/P1 finding**：此改动是纯语义等价重构，唯一实质收益是让 `TransactionOrigin` / `markProgrammaticContent` 具备真实消费方，消解了本报告 P2 观察第 1 条。

**验证**：改动后重跑 `npx vitest run src/lib/editor.state.test.ts src/main.lifecycle.guard.test.ts` → **45/45 通过（28+17），退出码 0**。hydrate 零编辑链路（`rev=0`、`dirty=false`、`saves=0`）与真实编辑链路（`rev>0`、save/persist）均未回归。

**结论**：原 PASS 结论不变。
