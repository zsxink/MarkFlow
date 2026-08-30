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
composition 待确认（末次提交 `isComposing` 仍为 `true`），必须按 **Return** 确认；此前按的是
右方向键，只在转换候选间移动。产品源码零改动。详见
`../issues/20260830-p4b-ja-kotoeri-undo-compositionend-gap.md`（已改 RESOLVED，保留设计事实）。

**对 P6 有约束力的设计事实**：composition 处于打开状态时，CodeMirror 的
`InputState.ignoreDuringComposition()` 会吞掉**所有**真实按键事件，整个 keymap 失效
（不只是 Undo）。P6 `9.2` 不得依赖 composition 期间的任何键盘快捷键。

## 每项 AI 编码验证

> 以下勾选依据 C01（433 unit）/ C10（byte contract）/ C15（28 desktop）中**实际存在并通过**的用例。
> 独立 Reviewer 需逐一复核断言强度，尤其是**剪贴板**（source-based clipboard 的桌面断言未确认存在）与 **a11y**。

- [x] interaction states 与 source fallback
- [x] empty heading/list/quote/fence 与 input-rule transition
- [ ] mouse/keyboard/selection/clipboard —— **剪贴板子项待复核**
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

## 已知缺口（交独立 Reviewer 判定，不由执行流自行关闭）

1. **各 item 缺少独立 RUN 叙事**：7.9/7.10 要求「每项独立运行并记录 maturity/default/fallback」，
   目前证据散落在 C01/C10/C15 的 gate 日志中，没有 per-item 的 RUN 记录。属**记录缺口**，
   不是验证缺口；但必须先补上才谈得上 per-item Go。
2. **source-based clipboard 断言未确认**：C15 覆盖了 task/fence/FrontMatter/failure-injection/
   rollback/themes/zoom/dispose/export，但未找到明确断言「plain-text copy/cut 含 source」的用例。
3. **`20260830-080554-p4b-widgets-a8c73de` 状态仍为 IN PROGRESS**，未封存；其与
   `20260830-083435-p4b-corrective-a8c73de` 的覆盖关系需 Reviewer 确认。

## Program decision

### Substrate checkpoint

- [x] interaction harness / visibility / atomic navigation（AI gate 全绿）
- [x] source clipboard / accessibility descriptor（AI gate 全绿；剪贴板断言强度待 Reviewer 复核）
- [x] real CJK/Japanese IME baseline（中/日文均 GO）
- [x] owner registry / nesting arbitration / source fallback（AI gate 全绿）
- [x] widget protocol / stale identity / rollback（AI gate 全绿）
- [ ] 自动化、独立 Reviewer、人工验收均签署 —— **未齐备**

决定：`P4B-SUBSTRATE-GO` **PENDING**。gate 与 IME baseline 已满足条件，但按治理要求，
Go 必须由独立 Reviewer + 人工验收 + Program Owner 齐备后由主会话记录；**执行流不自我批准**。

### Item decisions

每个轻量 widget 使用 `P4B-ITEM-<name>-GO/NO-GO`，在上表记录 maturity/default 并链接独立 run。
单项 No-Go 保持 source fallback，可在 P7 收口；当前所有项 OFF，等待 Reviewer 与人工验收后逐项裁决。
