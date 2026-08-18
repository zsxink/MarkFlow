# P2 独立 Reviewer 复核报告

Range: `8bbcb79 → fcba2f8`（36 files, +2798/-29）
分支：`test/issue-255-lossless-byte-contract`
复核方式：fresh context + 独立静态走查 + 重跑关键命令
复核时间：2026-08-18

## 一、清单 6 项复核结果

| # | 复核项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | projection 扩展不 dispatch doc changes | **PASS** | `projection.ts` 全文零 `view.dispatch`、零 doc 写入、零 Transaction 构造；只返回 DecorationSet；adapter test 证明 `view.state.doc.toString()===md` |
| 2 | mode switch 不重建 EditorView | **PASS** | `losslessSourceEditor.ts` setMode/setLivePreview 只 `projectionCompartment.reconfigure`；adapter 100 次往返 + CJK 20 次往返 identity/selection/assoc 不变 |
| 3 | source fallback 可局部清理 stale decoration | **PASS** | try/catch → `RangeSet.empty` + `degraded` + 插件存活；输入路径（handleTransactions）与投影解耦；malformed 不空白 |
| 4 | selection 未从 DOM textContent 反推 | **PASS** | 全 lossless 路径零 DOM 坐标反推；selection/reveal 全走 `state.selection.main`；E2E 的 textContent 读取仅为白盒断言 |
| 5 | 基础投影不等待 Core IPC | **PASS** | `projection.ts` 零 `invoke`/`@tauri-apps/api`；只同步读 Lezer tree + bounded ensureSyntaxTree |
| 6 | 重跑真实 desktop semantic E2E | **PASS** | `node e2e/run.mjs lossless` 实跑 1m33.6s，10/10 passing，exit 0 |

## 二、重跑命令结果

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `npm run test -- src/lib/lossless/projection.test.ts` | 5/5 PASS |
| `npm run test` | 35 files / 419 tests PASS |
| `node e2e/run.mjs lossless` | 10/10 PASS（1m33.6s） |

## 三、发现的问题

### P1（P3/Slice 3 前解决，不阻塞 P2）
1. **lossless preview 模式下 toolbar 按钮行为倾斜**：`btn-quote`/`btn-codeblock`/`insertImageSrc`/linkDialog 在 `getMode()==='source'` 分支操作 `getSourceView()` 或 hidden PM，而非 active binding；preview 切 `setMode('wysiwyg')` 后走到 PM 分支，工具栏操作在 preview 下失效（不读不写冲突，字节完整性与保存不受影响）。归口 tasks 5.1-5.3「统一 command router」。

### P2（建议/文档）
1. `headingsFromLossless`（`outline.ts:16-36`）注释声称用 syntax tree，实为正则行扫描；功能正确（P2 不投影 Setext），但注释与实现不符。
2. `syncModeUI` 未在 `switchToWysiwyg` 的 lossless 分支调用，按钮 active 态与 legacy 不对称（E2E 未暴露）。
3. `buildDecorations` 每次 selectionSet 全量重算可见区，无 per-block diff（viewport 级 closure 已满足 P2 4.5 的 `[~]`）。

## 四、结论

**GO（条件性）**

条件：
1. P1-1（toolbar 在 lossless preview mode 下不操作活动视图）在进入 Slice 3 前解决（tasks 5.1-5.3 归口）——非本阶段 NO-GO 理由；
2. 人工验收（视觉/IME/拖选/三主题）完成后再记录阶段完成。

P2 独立复核清单 **6/6 PASS**。投影纯 decoration 层（不碰 doc/History/IPC）、单一 EditorView 通过 Compartment reconfigure 切换、降级只清 decoration 且永不空白、selection 全走 CM EditorSelection、基础投影完全本地；tsc / 419 tests / 5 adapter / 实跑 lossless desktop E2E 10/10 全绿。