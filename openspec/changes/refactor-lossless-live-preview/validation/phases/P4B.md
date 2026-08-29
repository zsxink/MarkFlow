# P4B 验证记录：投影交互底座与轻量 Widgets

总体状态：`P4B-SUBSTRATE-GO` NOT STARTED；各 item NOT STARTED

正式设计：[P4B：Widgets 与 Cohorts](../../design/phases/P4B-widgets-cohorts.md)

每个 construct 必须复制本记录为 `P4B-<construct>.md`，不能只在本总表打勾。

## Construct 状态

| Construct | Flag | AI | Reviewer | Human | Default |
| --- | --- | --- | --- | --- | --- |
| visibility/interaction harness | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| source clipboard/a11y/atomic protocol | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| real CJK/Japanese IME baseline | — | NOT STARTED | NOT STARTED | NOT STARTED | — |
| task checkbox | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| code fence controls | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| image | — | MOVED TO P7 | — | — | — |
| GFM table | — | MOVED TO P7 | — | — | — |
| frontmatter | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| Mermaid/PlantUML | — | MOVED TO P7 | — | — | — |
| raw HTML | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |

> Image、GFM table、Mermaid/PlantUML 移交 P7，验证记录见 [P7.md](./P7.md)；它们仍是 Issue #254 必达范围。P4B 期间保持 exact source fallback。Marker hiding 不在 P4B 交付，由 P6 统一验证。

## 每项 AI Coding 验证

- [ ] interaction states 与 source fallback
- [ ] empty heading/list/quote/fence 与 input-rule transition
- [ ] mouse/keyboard/selection/clipboard
- [ ] Select All/double-click/drag/nested selection/Undo landing
- [ ] 真实 CJK/Japanese IME start/update/end
- [ ] Undo/Redo 与模式切换
- [ ] read-only/themes/zoom/high contrast
- [ ] screen reader role/name/state
- [ ] async stale/cancel/error/Retry
- [ ] local/widget/source-fallback owner handoff 与父子 editable slot 仲裁；历史 `core` 类型位运行时拒绝
- [ ] source patch 与 L1 bytes
- [ ] viewport create/dispose/memory
- [ ] export/print
- [ ] security/URL/sanitize

## 每项人工验证

- [ ] 编辑自然且 visible/dimmed marker 可发现（P4B 不验收 hidden）
- [ ] 光标和键盘行为可预测
- [ ] 失败后可回到源码
- [ ] 视觉达到默认开启标准
- [ ] screen reader/keyboard-only 完成
- [ ] 安全/资源负责人已参与高风险 widget

## Program decision

### Substrate checkpoint

- [ ] interaction harness / visibility / atomic navigation
- [ ] source clipboard / accessibility descriptor
- [ ] real CJK/Japanese IME baseline
- [ ] owner registry / nesting arbitration / source fallback
- [ ] widget protocol / stale identity / rollback
- [ ] 自动化、独立 Reviewer、人工验收均签署

决定：`P4B-SUBSTRATE-GO` **NOT STARTED**。该 checkpoint 是 P6/P7 的明确前置，不被任何单项 widget decision 代替。

### Item decisions

每个轻量 widget 使用 `P4B-ITEM-<name>-GO/NO-GO`，在上表记录 maturity/default 并链接独立 run。单项 No-Go 保持 source fallback，可在 P7 收口；当前所有项 OFF / NOT STARTED。
