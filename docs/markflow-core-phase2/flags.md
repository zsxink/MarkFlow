# Phase-2 Feature Flags 与 Rollback 矩阵

机器可读源：`openspec/capabilities/flags.json`（schema：`flags.schema.json`）。
本文件是人读摘要；`scripts/check-capability-matrix.sh` 校验 flags 的 schema、
fallback 枚举与过期删除。

## 规则

- 每个 flag 记录 `id`、`stage`、`default`、`fallback`、`deleteAfter`、`owner`。
- **fallback 只允许 `exact-source-projection`**。禁止 `serializer`、`dom-save`、
  `prosemirror` 及任何引入第二文档真相的回退；校验脚本拒绝其他值。
- `deleteAfter` 是删除时间（里程碑名或 YYYY-MM-DD 日期）。日期已过的 flag 必须
  从产品配置中移除，校验失败。
- 回退行为与 README §11.2 对齐：
  - R0/R1：Source Mode default，关闭 preview。
  - R2：按 construct 回退 source。
  - R3：按 block 回退 source。

## Flags

| id | stage | default | fallback | deleteAfter | owner |
| --- | --- | --- | --- | --- | --- |
| `wysiwyg.singleEditorView.v1` | r1a | false | exact-source-projection | r2b | r1a-single-editor-surface |
| `wysiwyg.renderIr.v2` | r2a | false | exact-source-projection | r2b | r2a-render-ir-v2 |
| `wysiwyg.livePreview.v2` | r2b | false | exact-source-projection | r5c | r2b-live-preview |
| `wysiwyg.markerFolding` | r2b | false | exact-source-projection | r5c | r2b-live-preview |
| `widget.table` | r3b | false | exact-source-projection | r5c | r3b-table-image-widgets |
| `widget.image` | r3b | false | exact-source-projection | r5c | r3b-table-image-widgets |
| `widget.frontmatter` | r3c | false | exact-source-projection | r5c | r3c-frontmatter-diagram-html |
| `widget.diagram` | r3c | false | exact-source-projection | r5c | r3c-frontmatter-diagram-html |
| `html.rawPolicy` | r3c | false | exact-source-projection | r5c | r3c-frontmatter-diagram-html |

## 说明

- 所有 flag 默认关闭（default false）：未通过 composition/selection gate 的
  construct 保持实验性、默认 off。
- `deleteAfter` 为里程碑（r2b/r5c）的 flag 在对应里程碑完成并验收后删除；
  为日期的 flag 在日期过后必须移除。
- flag 引用与 capability matrix 一一对应：matrix 中非 null 的 `flag` 必须
  在 `flags.json` 注册（`check-capability-matrix.sh` 校验）。
