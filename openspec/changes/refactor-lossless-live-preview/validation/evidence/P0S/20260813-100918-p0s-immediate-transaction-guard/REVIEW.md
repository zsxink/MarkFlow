# Independent Review — P0S Immediate Transaction Guard Corrective

状态：**NO-GO**

Reviewer：独立 fresh-context Reviewer agent（只读；2026-08-13）

结论：不得完成任务 1S.10，不得进入 P1A。

## P0：in-flight 保存完成可能污染新打开的文档

位置：`src/components/sidebar.fileops.ts:217-224`、`src/lib/editor.ts:100-123`。

最小触发：

1. 文档 A revision=1，启动保存并让 `writeFile` 保持 in-flight；
2. 保存未完成时选择“不保存”并切换到 B；
3. 编辑 B，使 B revision 也为 1；
4. A 的保存异步完成。

实际影响：A 的完成回调会对当前全局文档 B 调用 `setLastReadStats` 和
`markDocumentPersisted(..., 1)`。A/B revision 数值相同时，B 会被错误标记为
persisted/clean，失去关闭、切换和 autosave 保护。若 pending image 处理改变 Markdown，
`setMarkdown(prepared.markdown)` 还可能把 A 内容装载进 B。

要求：保存开始时捕获 document path/identity/generation；完成回调只有 identity 仍匹配时
才能更新 active document；persisted revision 必须绑定文档身份。新增 A save barrier →
discard-switch B → edit B → release A 回归，证明 B 内容、dirty、revision 和 file stats 不变。

## P1：保存互斥锁在首次异步等待后才设置

位置：`src/components/sidebar.fileops.ts:109-140`、`187-213`。

首次保存等待 Save 对话框或 `get_file_stats` 时，第二次 Cmd+S/autosave 仍可通过
`savingInProgress` 检查，造成并发 prepare/write，并竞争 pending-image draft 和 persisted
状态。保存权必须在任何 `await` 前占用，并由覆盖完整函数的 `try/finally` 释放；需补
delayed-stat + 双 Save 测试，断言只发生一次写入。

## P1：专用 P0S desktop lifecycle 尚未执行

标准 `npm run test:e2e` 独立复跑为 PASS，但 `e2e/run.mjs` 明确配置
`autosave:false`，现有 smoke 只覆盖 source-mode 编辑/保存/重载，没有覆盖零编辑两个
autosave tick、立即 WYSIWYG Save/A→B/close、in-flight 或跨文档隔离。因此标准 smoke
不能满足 1S.10 的真实 desktop autosave lifecycle。

要求：新增专用 WebKit/Tauri lifecycle，启用 autosave，使用 LF/CRLF/Mixed fixture，
记录 hash/length/mtime/save count，并覆盖立即操作和上述 A→B in-flight 竞态。

## P2：状态索引和覆盖描述不一致

- `validation/README.md` 仍显示历史 P0S GO，与 corrective NO-GO 不一致；
- RUN/phase 曾把“同文档 in-flight revision”表述为完整“跨文档隔离”，实际没有
  in-flight A→B 测试。

## 独立重跑

| 命令 | 结果 |
| --- | --- |
| targeted Vitest | PASS，4 files / 72 tests |
| `npx tsc --noEmit` | PASS |
| `npm test` | PASS，32 files / 373 tests |
| `npm run test:characterization` | PASS，9/9；L1 serializer byte loss 仍被捕获 |
| `npm run test:e2e` | PASS，WebKit 605.1.15，1 spec / 5 tests |
| `npx openspec validate refactor-lossless-live-preview --strict` | PASS |
| `git diff --check` | PASS |
| evidence manifest verification | PASS |

规范和阶段文档没有错误宣称编辑后 byte fidelity 已解决。Reviewer 未修改任何文件。

---

## Addendum（2026-08-13）— 修复复核

状态：**PASS**（三项 ISSUE 均已修复并复核通过）

上一轮 NO-GO 的三项问题在本次纠偏候选中得到修复，fresh-context 独立 Reviewer 复核 PASS：

1. **ISSUE-001（P0）**：`saveActiveDocument` 启动捕获 `documentGeneration`，异步完成后
   `setLastReadStats`/`markDocumentPersisted`/`setMarkdown(prepared)` 全部带
   `getDocumentGeneration() === saveGeneration` 守卫；不匹配时保留新文档状态。
   单元测试精确命中竞态（A save barrier → 切 B → release A → B 不被标记 clean）。
2. **ISSUE-002（P1）**：`savingInProgress` 锁在任何 await 前占用（`sidebar.fileops.ts:135`），
   整个函数体 `try/finally`，逐条核对所有 return 路径均释放锁，无泄漏。
   顺带修复 `confirmDocumentTransition` 的 truthy 字符串误判（`saved === 'saved'`）。
3. **ISSUE-003（P1）**：新增专用 P0S desktop lifecycle e2e（`e2e/specs/p0s/`，autosave=true
   interval=2000ms），4 个测试全过：零编辑双 tick 字节不变、立即 Cmd+S 保存 X、
   立即 A→B discard 不污染、干净 Cmd+S 不写盘。

复核运行：
- `npx vitest run src/components/sidebar.fileops.test.ts`：15/15
- `npx vitest run src/lib/editor.state.test.ts src/main.autosave.test.ts src/main.lifecycle.guard.test.ts`：59/59
- `npm test`：375/375（32 files）
- `npm run test:e2e:p0s`（含 test:e2e:build）：4/4，exit 0

红线检查：未接受 serializer baseline、未扩大 trailingNewlines、未关闭 autosave、不漏真实用户编辑。

### Findings

- **P2（记录在案，非阻塞）**：`saveActiveDocumentAsNewFile`（另存为路径）无 generation 守卫，
  与 ISSUE-001 同类但为既有缺口；save-as 模态框阻断编辑 + 本地写盘极快，实际窗口很小。
  建议后续将 generation 守卫同样应用到该路径。
- **P3（测试标注/覆盖度）**：e2e「A→B switch」只断言 discard 不写 A，未制造延迟 in-flight
  generation 竞态（该竞态由单元测试覆盖）；「zero-edit → close」未真实关闭窗口（由单元
  handleCloseRequested 覆盖）；「立即 Cmd+S」800ms < 2000ms interval 理论上有 autosave
  干扰的极低概率，可接受。
