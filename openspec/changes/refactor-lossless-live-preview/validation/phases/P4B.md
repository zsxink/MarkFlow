# P4B 验证记录：投影交互底座与轻量 Widgets

总体状态：`P4B-SUBSTRATE-GO` 待裁决 —— 20/20 gate 全绿、真实中/日文 IME 均通过；**独立 Reviewer 与人工验收未完成，执行流不自我批准 Go**

正式设计：[P4B：Widgets 与 Cohorts](../../design/phases/P4B-widgets-cohorts.md)

每个 construct 必须复制本记录为 `P4B-<construct>.md`，不能只在本总表打勾。

## Construct 状态

| Construct | Flag | AI | Reviewer | Human | Default | Run |
| --- | --- | --- | --- | --- | --- | --- |
| visibility/interaction harness | OFF | EVIDENCE RECORDED | PENDING | PENDING | OFF | `20260830-064651-p4b-6432059` |
| source clipboard/a11y/atomic protocol | OFF | EVIDENCE RECORDED（剪贴板断言待复核） | PENDING | PENDING | OFF | `20260830-064651-p4b-6432059` |
| **real CJK/Japanese IME baseline** | — | **EVIDENCE RECORDED — 中文 GO / 日文 GO** | PENDING | PENDING | — | `20260830-102354-p4b-ime-7869de8` |
| task checkbox | OFF | EVIDENCE RECORDED | PENDING | PENDING | OFF | `20260830-083435-p4b-corrective-a8c73de` |
| code fence controls | OFF | EVIDENCE RECORDED | PENDING | PENDING | OFF | `20260830-083435-p4b-corrective-a8c73de` |
| frontmatter | OFF | EVIDENCE RECORDED | PENDING | PENDING | OFF | `20260830-102354-p4b-ime-7869de8` |
| raw HTML | OFF | EVIDENCE RECORDED | PENDING | PENDING | OFF | `20260830-102354-p4b-ime-7869de8` |
| image | — | MOVED TO P7 | — | — | — | — |
| GFM table | — | MOVED TO P7 | — | — | — | — |
| Mermaid/PlantUML | — | MOVED TO P7 | — | — | — | — |

> Image、GFM table、Mermaid/PlantUML 移交 P7，验证记录见 [P7.md](./P7.md)；它们仍是 Issue #254 必达范围。P4B 期间保持 exact source fallback。Marker hiding 不在 P4B 交付，由 P6 统一验证。

### 真实 IME baseline（7.3）

- **中文 Pinyin：GO** —— `compositionstart/update/end` 全触发，`# marker\n` → `#中文 marker\n`，1 次 Cmd+Z 精确还原。
- **日文 Kotoeri：GO** —— `compositionstart/update/end` 全触发，`> marker\n` → `>日本語 marker\n`，1 次 Cmd+Z 精确还原，提交后 `view.composing === false`。
- Run：`../evidence/P4B/20260830-102354-p4b-ime-7869de8/RUN.md` / `gates/C20-e2e-ime.log`

**结论修正（重要）**：`20260830-083435-p4b-corrective-a8c73de` 曾把日文记为「产品缺陷：不触发
`compositionend`」。根因实为 **harness 用错确认键**——Kotoeri ライブ変換显示汉字后仍保持
composition 待确认（末次提交 `isComposing` 仍为 `true`），必须按 **Return** 确认；而旧 harness
**从未发送任何确认键**，只送 `nihongo `（尾随空格）后等待。
> **事实更正（2026-08-30，独立 Reviewer F-9）**：此前本文称「按的是右方向键」，该叙述与 git 历史不符
> ——`p4b-real-ime.e2e.mjs` 的 `b50e392` 版无方向键、无 `target.id === 'ja'` 分支，
> `git log -S"Arrow"` 仅命中修复提交自身新增的注释。「右方向键」从未作为已提交基线存在过。
产品源码零改动。详见
`../issues/20260830-p4b-ja-kotoeri-undo-compositionend-gap.md`（已改 RESOLVED，保留设计事实）。

**对 P6 有约束力的设计事实**：composition 处于打开状态时，CodeMirror 的
`InputState.ignoreDuringComposition()` 会吞掉**所有**真实按键事件，整个 keymap 失效
（不只是 Undo）。P6 `9.2` 不得依赖 composition 期间的任何键盘快捷键。

## 每项 AI 编码验证

> 以下勾选依据 C01（433 unit）/ C10（byte contract）/ C15（28 desktop）中**实际存在并通过**的用例。
> 独立 Reviewer 需逐一复核断言强度，尤其是**剪贴板**（见「已知缺口 2」：widget copy 按钮已断言，
> 选区 copy 无证据）与 **a11y**。

- [x] interaction states 与 source fallback
- [x] empty heading/list/quote/fence 与 input-rule transition
- [ ] mouse/keyboard/selection/clipboard —— **选区 copy 子项缺证据**（widget copy 按钮已通过；
      合成 `ClipboardEvent` 断言已起草，待 Reviewer 结论后落盘 + 新建 run-id 重跑）
- [x] Select All/double-click/drag/nested selection/Undo landing
- [x] 真实 CJK/Japanese IME start/update/end
- [x] Undo/Redo 与模式切换
- [x] read-only/themes/zoom/high contrast
- [x] screen reader role/name/state
- [x] async stale/cancel/error/Retry
- [x] local/widget/source-fallback owner handoff 与父子 editable slot 仲裁；历史 `core` 类型位运行时拒绝
- [x] source patch 与 L1 bytes
- [x] viewport create/dispose/memory
- [x] export/print
- [x] security/URL/sanitize

## 每项人工验证

- [ ] 编辑自然且 visible/dimmed marker 可发现（P4B 不验收 hidden）
- [ ] 光标和键盘行为可预测
- [ ] 失败后可回到源码
- [ ] 视觉达到默认开启标准
- [ ] screen reader/keyboard-only 完成
- [ ] 安全/资源负责人已参与高风险 widget

## 证据不可变性问题登记（F-1，独立 Reviewer 发现，执行流确认属实）

**事实**：提交 `7869de8` 回写了**已封存**的 run `20260830-083435-p4b-corrective-a8c73de/`。
执行流已用 `git show 7869de8 --stat` 亲自核实，改动清单如下：

| 改动 | 内容 |
| --- | --- |
| `RUN.md` | 状态行由 `PASS（19/19 gates；真实 IME 仍为独立 OPEN 项）` 改为 `PASS（20/20 gates；真实 IME 证据已补齐 …）` |
| `RUN.md` | 新增 `C20` gate 行 —— 该 run 原始 gate 集只有 C01–C19，C20 从不属它 |
| `RUN.md` | 删除原「Run hygiene note (two discarded runs)」整段，替换为另一版本叙述 |
| gate 日志 | 重跑覆盖 `C04 / C14 / C15 / C15-rerun1 / C16 / C17 / C18 / C19` 八个 |
| gate 日志 | 新增 `gates/C20-e2e-ime.log`（+140 行） |

违反 `VALIDATION-PROTOCOL.md:73`（历史 RUN/ENVIRONMENT/REVIEW 为不可变证据；须建 corrective run
链接，不得直接修改历史结论）。

**定性**：改动方向是「补记一个缺口」，**不是**把失败伪装成通过（`083435/RUN.md` 现在把日文记为
product gap，而非通过）。但它确实改变了已封存 run 的结论与 gate 集。

**处置**：**不回滚。** 回滚本身构成第二次篡改，且协议禁止。改为：
1. 在本阶段文档登记该事实与完整改动清单（即本节）；
2. 在 `20260830-102354-p4b-ime-7869de8/RUN.md` 的「Run hygiene」段更正不实陈述（已完成）；
3. 新建 corrective run，在其 `RUN.md` 中再次登记并链接本节。

**教训**：corrective run 的目录一旦建立，后续任何提交都不得再触碰它。
写证据时若同时需要改历史 run，说明流程本身就走错了。

## 已知缺口（交独立 Reviewer 判定，不由执行流自行关闭）

1. **各 item 缺少独立 RUN 叙事**：7.9/7.10 要求「每项独立运行并记录 maturity/default/fallback」，
   目前证据散落在 C01/C10/C15 的 gate 日志中，没有 per-item 的 RUN 记录。属**记录缺口**，
   不是验证缺口；但必须先补上才谈得上 per-item Go。
2. **source-based clipboard 只覆盖到 widget 按钮，选区 copy 无证据**（2026-08-30 缩小范围后重述）：
   - **已有**：`e2e/specs/lossless/p4b-widgets.e2e.mjs:199` 与 `:233` 断言 fence widget 的
     copy 按钮（点击与 Enter 两种激活方式）写入 `const x = 1;`，即 fence 的 **source 内容**。
     这是一条真实存在的 source-based clipboard 断言，此前记成「未确认」是不准确的。
   - **缺失**：**基于选区的 copy/cut（Cmd+C / Cmd+X）plain-text payload 是否为完整 Markdown
     source** —— `src/lib/lossless/` 下无任何剪贴板单元测试，桌面 suite 中亦无对应断言。
   - **为什么这条不能只靠推理**：CodeMirror 的 `handlers.copy` 用
     `copiedRange()` → `state.sliceDoc()`，P4B 又不输出 `hidden`，所以**结构上**选区 copy
     天然产出 source。但「结构上应当如此」不等于「有证据」，而 P6 的
     `typora-wysiwyg-editing`「复制隐藏内容」场景（`specs/typora-wysiwyg-editing/spec.md:62`）
     与 `tasks.md` §7.6 的 "source-based clipboard" 都直接依赖这个合同。
   - **处置**：已起草选区 copy 断言（合成 `ClipboardEvent` + `DataTransfer`，走 CodeMirror
     真实 `handlers.copy` 路径），待独立 Reviewer 结论后落盘并**新建 run-id 重跑全 gate**。
3. **`20260830-080554-p4b-widgets-a8c73de` 已封存为 SUPERSEDED**（2026-08-30 处理）：补记了
   封存附录。结论是该 run 的 19 个 gate **日志内容一致显示成功，但退出码从未捕获**
   （`gates/` 只有 `.log` 无 `.exit`），因此**不作正式 gate run**，其 widget/策略项只作
   探索性证据；正式 gate 证据为 `20260830-102354-p4b-ime-7869de8`（20/20，含退出码）。
   同时记录了 smoke `5 skipped` / p0s `1 skipped` 的口径：那是聚合入口
   （`all-smoke.e2e.mjs` / `all-p0s.e2e.mjs`）导致被聚合文件顶层零测试，**不是覆盖缺口**。

## Program decision

### Substrate checkpoint

- [x] interaction harness / visibility / atomic navigation（AI gate 全绿）
- [x] source clipboard / accessibility descriptor（AI gate 全绿；**剪贴板仅覆盖 widget copy 按钮，选区 copy 无证据，见「已知缺口 2」**）
- [x] real CJK/Japanese IME baseline（中/日文均 GO）
- [x] owner registry / nesting arbitration / source fallback（AI gate 全绿）
- [x] widget protocol / stale identity / rollback（AI gate 全绿）
- [ ] 自动化、独立 Reviewer、人工验收均签署 —— **未齐备**

决定：`P4B-SUBSTRATE-GO` **PENDING**。gate 与 IME baseline 已满足条件，但按治理要求，
Go 必须由独立 Reviewer + 人工验收 + Program Owner 齐备后由主会话记录；**执行流不自我批准**。

### Item decisions

每个轻量 widget 使用 `P4B-ITEM-<name>-GO/NO-GO`，在上表记录 maturity/default 并链接独立 run。
单项 No-Go 保持 source fallback，可在 P7 收口；当前所有项 OFF，等待 Reviewer 与人工验收后逐项裁决。
