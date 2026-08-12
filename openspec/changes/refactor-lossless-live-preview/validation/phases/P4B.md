# P4B 验证记录：Marker Cohorts 与 Widgets

总体状态：BLOCKED by P4A or construct prerequisites

正式设计：[P4B：Widgets 与 Cohorts](../../design/phases/P4B-widgets-cohorts.md)

每个 construct 必须复制本记录为 `P4B-<construct>.md`，不能只在本总表打勾。

## Construct 状态

| Construct | Flag | AI | Reviewer | Human | Default |
| --- | --- | --- | --- | --- | --- |
| heading+strong | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| emphasis+strike+inline-code | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| links | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| quote+lists | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| fence | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| task checkbox | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| code fence controls | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| image | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| GFM table | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| frontmatter | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| Mermaid/PlantUML | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |
| raw HTML | NOT RECORDED | NOT STARTED | NOT STARTED | NOT STARTED | OFF |

## 每项 AI Coding 验证

- [ ] interaction states 与 source fallback
- [ ] mouse/keyboard/selection/clipboard
- [ ] CJK/emoji/IME
- [ ] Undo/Redo 与模式切换
- [ ] read-only/themes/zoom/high contrast
- [ ] screen reader role/name/state
- [ ] async stale/cancel/error/Retry
- [ ] local/Core owner handoff
- [ ] source patch 与 L1 bytes
- [ ] viewport create/dispose/memory
- [ ] export/print
- [ ] security/URL/sanitize

## 每项人工验证

- [ ] 编辑自然且 marker 可发现
- [ ] 光标和键盘行为可预测
- [ ] 失败后可回到源码
- [ ] 视觉达到默认开启标准
- [ ] screen reader/keyboard-only 完成
- [ ] 安全/资源负责人已参与高风险 widget

## Program decision

P4B 总体不使用单一 Go 覆盖各项。每项 default decision 写在上表并链接独立 run。当前所有项 OFF。
