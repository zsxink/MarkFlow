# P4B 日文 Kotoeri ライブ変換未确认导致 composition 不结束、Undo 失效（harness 缺陷，已修复）

状态：**RESOLVED — harness 缺陷，非产品缺陷**

> **结论修正**：本 issue 最初被记为「产品缺陷：日文 IME 不触发 `compositionend`」。深入取证后该结论**不成立**。
> 日文 composition 未结束是因为 **harness 用错了确认键**：Kotoeri ライブ変換在显示汉字后仍保持 composition 待确认，必须按 Return 确认。
> 原 harness **从未发送任何确认键**，只是送出 `nihongo `（尾随空格）后等待，因此 composition 一直开着。产品代码无需修改。
> 保留本文作为调查记录，因为它产出了一条对 P6 有约束力的**设计事实**（见「保留的设计事实」）。

> **事实更正（2026-08-30，独立 Reviewer F-9）**：本文与 `RUN.md` 原先称「原 harness 按的是右方向键」。
> 该叙述**与 git 历史不符，是执行流的记忆错误**：`e2e/specs/lossless/p4b-real-ime.e2e.mjs`
> 在仓库中只有两个提交（`b50e392` 原始版、`7869de8` 修复版），`b50e392` 版中日文键串为
> `'nihongo '`、且**不存在** `target.id === 'ja'` 分支；`git log -S"Arrow" -- <该文件>` 只命中
> `7869de8` 自身新增的注释。即「右方向键」从未作为已提交基线存在过。
> **根因结论与修复均不受影响**（无论旧 harness 是没按键还是按错键，补发 Return 都是正确的修复），
> 但「旧行为」的准确描述应为：**未发送确认键，尾随空格在 Kotoeri 中只打开/推进转换、不提交**。

| 字段 | 值 |
| --- | --- |
| Issue ID | `P4B-JA-KOTOERI-UNDO-COMPOSITIONEND-GAP` |
| Severity | Validation harness defect（原误判为 product behavior blocker） |
| Phase | P4B 7.3 |
| Run ID | `20260830-083435-p4b-corrective-a8c73de`（发现）→ 修复后重跑同 run 的 C20 |
| Commit/flags | after `b50e392`；lossless + Live Preview ON；`p4b*` flags ON |
| Environment | macOS 26.5.2; Tauri v2 debug binary; WebKit 605.1.15; `com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese` |
| Owner | Codex root executor |

## Expected

日文 IME 在 marker 邻域完成真实 composition（`compositionstart`、`compositionupdate`、`compositionend`），提交后的 CJK 文本紧邻 marker，且**一次 Cmd+Z 恢复初始 source**。

## Actual（发现时）

- 真实 HID 按键可送达 WebView，`compositionstart` 与多次 `compositionupdate` 正常触发；
- CJK 文本正确提交（`> marker\n` → `>日本語 marker\n`）；
- **但 `compositionend` 从未触发**，连续 3 次 Cmd+Z 文档保持不变；
- 同一次 run 中文 Pinyin 完全通过，排除 harness 的激活/记录/Undo 路径本身的问题。

## Root cause（最终，已取证）

1. **Kotoeri ライブ変換是「已转换但未确认」状态。** 输入 `nihongo` 后 Kotoeri 立即显示 `日本語`，但 composition 仍处于打开状态等待用户确认候选。证据：最后一次提交的 `beforeinput`/`input` 上 **`e.isComposing === true`**，浏览器自己就认为 composition 仍在进行。

2. **CodeMirror 在 composition 打开时按设计冻结整个 keymap。** `@codemirror/view` 的 `InputState.ignoreDuringComposition()` 在 `this.composing > 0` 时对所有真实按键返回 `true`，`handleEvent()` 随即提前 return —— 因此**不只是 Undo，Enter/Backspace/Cmd+B/Escape/方向键全部失效**。实测 `view.composing === true`、`view.inputState.composing === 7`。

3. 这条冻结**对一个确实仍然打开的 composition 是正确的**（此时键盘归 IME 所有）。所以这不是产品 bug；错误的是 harness 让它一直开着。

4. 附带排除一个常见误判：CodeMirror 自带的 missed-`compositionend` 兜底（`dist/index.js` 中 `browser.safari && event.inputType == "insertText"`）**故意不匹配**本场景，因为日文每次 composition 更新都是 `insertCompositionText`，若按 `inputType` 兜底会在每次击键时误结束 composition、造成文本错乱。

### 决定性实验

harness 内注入一次合成 `CompositionEvent('compositionend')`（仅诊断，不作为产品证据）：
`composing: true → false`、`inputState.composing: 7 → -1`，随后**一次 Cmd+Z 即恢复 `> marker\n`**。
证明 history 记录完好，Undo 失效纯粹由滞留的 composition 状态导致。

### 修复

给日文目标**补发**确认键 **Return**（真实日文用户的确认方式）。修改前 harness 只送出 `nihongo `
（尾随空格）后即等待，**从未发送任何确认键**（事实更正见文首）。修复后日文与中文的事件形状完全一致：

```
compositionupdate(日本語) → insertCompositionText(日本語)
→ deleteCompositionText → insertFromComposition(日本語) → compositionend(日本語)
```

## 修复后结果（两个目标均严格通过）

| 检查 | zh-Hans (Pinyin) | ja (Kotoeri) |
| --- | --- | --- |
| `compositionstart` / `update` / `end` | ✓ / ✓ / ✓ | ✓ / ✓ / ✓ |
| 提交路径 | `deleteCompositionText` → `insertFromComposition` → `compositionend` | 同左 |
| docAfter | `#中文 marker\n` | `>日本語 marker\n` |
| 一次 Cmd+Z 后 | `# marker\n` | `> marker\n` |
| undoCount | 1 | 1 |
| 提交后 `view.composing` | `false` | `false` |

## 保留的设计事实（对后续阶段有约束力）

> **只要 composition 处于打开状态，CodeMirror 会吞掉所有真实按键事件，编辑器 keymap 完全失效。**

推论与约束：

- P6 `9.2`（composition 强制 reveal 或冻结安全投影）必须**不能依赖 composition 期间的任何键盘快捷键**，包括但不限于 Undo、Escape、Enter、格式快捷键。
- 任何「composition 中弹出提示/需要用户按键确认」的交互设计都不可行。
- 若将来出现 composition 真的无法结束（本 issue 的场景若由上游 IME/WebKit 变化引起），症状是**键盘整体失灵**而非仅 Undo 失效；排查时先看 `view.composing`，并注意此时 history 记录是完好的。

## Byte/file impact

无。测试使用隔离 workspace（`e2e/.tmp-*/workspace`），测试后删除。产品代码零改动。

## Evidence

- `../evidence/P4B/20260830-083435-p4b-corrective-a8c73de/gates/C20-e2e-ime.log`
- `e2e/artifacts/p4b-real-ime.json`（含 `compositionProbe`、`forcedEndExperiment`、每个事件的 `inputType` 与 `isComposing`）

## Verification

DONE —— `node e2e/run.mjs ime` 严格断言（要求 `compositionend`、`undoRestoredOriginal`、`undoCount === 1`、提交后 `composing === false`）复测通过。

## Closure

- Fix commit: 见 P4B IME harness checkpoint（`e2e/specs/lossless/p4b-real-ime.e2e.mjs` 确认键改为 Return + 断言收紧）
- Passing run: `20260830-083435-p4b-corrective-a8c73de` rerun（C20）
- Reviewer: PENDING（随 P4B 独立 Reviewer 复核）
- Closed date: 2026-08-30
