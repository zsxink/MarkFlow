# RUN — 20260830-134007-p4b-acceptance-full-b1e4c05

**类型**：P4B 人工验收 harness 的**全量重跑**（corrective evidence，非 corrective conclusion）
**触发**：Reviewer-2 Round 3 blocker **B-4**
**上游 run**：`20260830-122241-p4b-human-acceptance-1f1bd3c`
**环境**：见同目录 `ENVIRONMENT.md`（先于本文件阅读）

## 1. 结论

| 项 | 结果 |
| --- | --- |
| 命令 | `npx wdio run /tmp/p4b-acc/wdio.conf.mjs` |
| 退出码 | **0**（`run.exit`） |
| Spec Files | **3 passed / 3 total (100%)** |
| 用例 | **13 passing, 0 failing** |
| 耗时 | 00:01:33 |

三 spec 在**同一进程、同一顺序**下跑完——与 12:10:24 那次失败的全量 run 是同一口径。

| spec | 用例数 | 结果 |
| --- | --- | --- |
| `1-clipboard.e2e.mjs` | 4 passing | ✓ |
| `2-editing.e2e.mjs` | 4 passing | ✓（含 item 1 / item 2 ×2 / item 3） |
| `3-visual-a11y-security.e2e.mjs` | 5 passing | ✓（含 item 4 ×3 / item 5 / **item 6**） |

## 2. 三项曾失败用例的取值对照

这是本 run 的核心价值：把 item 2 / 3 / 6 从「混淆对比」换成「同口径全量」。

| 字段 | 旧全量 `run.log`<br>12:10:24・**改前** | 旧隔离 `run2/3.log`<br>12:18–12:21・改后 | **本 run**<br>13:40・**改后 + 全量** |
| --- | --- | --- | --- |
| `item2.typing.composingBefore` | （无该键） | `{"composing":false}` | `{"composing":false,"viewHasFocus":true}` |
| `item2.typing.composingAfterTyping` | （无该键） | `{"composing":true}` | `{"composing":true,"viewHasFocus":true}` |
| `item2.typing.composingAfterCommit` | （无该键） | `{"composing":false}` | `{"composing":false,"viewHasFocus":true}` |
| `item2.typing.singleUndoRestoredBytes` | **false**（失败） | `true` | **`true`** |
| `item3.recovered.projectionState` | **`"composing"`** | `"rendered"` | **`"rendered"`** |
| `item3.fallbackEditable` | **`false`** | `true` | **`true`** |
| `item6` | **失败**（`openDoc` waitUntil 15s 超时） | 通过 | **通过** |

**结论**：`HUMAN-ACCEPTANCE.md` 记录的两行依据
（`item3.recovered.projectionState = 'rendered'`、`fallbackEditable` 仍可编辑）
在**改后 spec 的全量口径下复现**，与隔离重跑一致。
即：验收报告的取值是对的，问题只在于它没说明出处是「改后 spec」。
本 run 给出 unconfounded 出处，B-4 ①② 由此闭合。

## 3. 顺带推翻的一个结论（重要）

此前在 `P4B.md` 登记的「item 6 是 3 条失败里**唯一没有对应修复**的，
重跑通过属于『复现不出来』，交 P6 作为环境风险持续观察」——**该结论不成立**。

mtime 取证（harness 在 `/tmp`，无版本控制，只能靠时间戳）：

```
12:05:30  wdio.conf.mjs
12:06:49  specs/1-clipboard.e2e.mjs
12:10:24  run.log         ← 全量 run，item 2 / 3 / 6 失败
12:17:31  specs/2-editing.e2e.mjs            ← 改（+7min）
12:18:19  run2.log        ← spec 2 隔离重跑通过（改后 +48s）
12:20:15  lib.mjs                            ← 改（+10min）★ 此前漏记
12:20:31  specs/3-visual-a11y-security.e2e.mjs ← 改（+10min）★ 此前漏记
12:21:31  run3.log        ← spec 3 隔离重跑通过（改后 +60s）
12:22:31  run1.log        ← spec 1 隔离重跑（spec 1 未改）
```

**item 6 失败的正是 `lib.mjs:58` 的 `openDoc`**（`run.log`:
`waitUntil condition timed out after 15000ms ... at async openDoc (lib.mjs:58:3)`），
而 `lib.mjs` 在 12:20:15 被改，**76 秒后** run3 就通过了。

现在 `openDoc` 顶部的注释直接写出了该失败机制：

```javascript
// Never leave a dirty document behind: an unsaved-changes modal would block
// the next file-tree click and make the following waitUntil time out.
```

并因此新增了两段防护：切文件前若 `isDirty()` 则先 `save(false)`，
再 `waitUntil(isDirty() === false, {timeout: 5_000})`。

因果链：spec 3 里 **item 5（真实 Tab 遍历）跑在 item 6 之前**，
Tab 把文档改脏 → item 6 点文件树时被「未保存更改」弹窗挡住 →
`activeFilePath` 一直没变 → 15s waitUntil 超时。

**所以 item 6 既不是 flaky，也不是环境风险，而是 harness 缺陷——且已被修复。**
本 run 中 item 6 在**全量同进程同顺序**下通过，是该修复的第三次独立确认。

保留的诚实边界：spec 3 的具体改动内容**无法 diff**（harness 在 `/tmp` 且未纳入版本控制），
只能证明「它被改过」+「共享的 `lib.mjs` 改了失败函数本身且注释与症状吻合」。
因此这里给出的是**机制已识别并有代码自证**，不是受控 A/B 证明。

## 4. 本 run 不覆盖什么

1. **未提交 composition 期间按 Cmd+Z** —— 改后 spec 显式绕开（先 `Return` 提交再 Cmd+Z）。
   该场景零覆盖，登记为 **P6 open item**（见 `P4B.md`）。
2. **系统 pasteboard 端到端**：本 run 用 `pbpaste` 回读，验证了进程内一致性，
   但「Cmd+C → 外部应用粘贴」的完整链路仍属人工验收项。
3. `item6.flagOff.*` 三项（htmlBlockPresent / scriptElementsInEditor / scriptExecuted）
   全部为「无害」取值（false / 0 / false），`flagOn.sourceUnchanged = true`——
   raw HTML 的**产品裁决**不因本 run 改变，仍为 NO-GO + source fallback，待安全责任人签署。

## 5. 产物

| 文件 | 说明 |
| --- | --- |
| `ENVIRONMENT.md` | 被测对象、环境、harness 指纹 |
| `run.log` | 完整 WDIO 输出（148 行） |
| `run.exit` | `EXIT=0` |
| `findings-clipboard.json` / `findings-editing.json` / `findings-visual.json` | 结构化 FINDING |
| `shots/` | 35 张截图 |
| `specs/` | harness 快照（含 `wdio.conf.mjs`、`lib.mjs` 与三个 spec） |

快照进 `specs/` 的原因：harness 原始位置 `/tmp/p4b-acc` 重启即失，
若证据依赖临时目录，则本 run 不可复现。
