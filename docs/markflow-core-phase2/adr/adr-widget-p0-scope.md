# ADR: Structured Widget P0/P1 发布范围

- Status: Accepted for R0 baseline
- Date: 2026-07-31
- Evidence: `openspec/capabilities/manifests/widget-scope.json`

## Decision

WYSIWYG 成为产品默认之前，structured widgets 按 P0/P1 分层发布。机器可读范围为
`openspec/capabilities/manifests/widget-scope.json`（本 ADR 批准后冻结，修改需
更新 ADR）。

### P0（默认切换前必须发布）

- `task-list-checkbox`
- `code-fence-panel`
- `gfm-table-grid`
- `image-preview`
- `frontmatter-form`
- `mermaid-diagram`
- `plantuml-diagram`
- `html-comment-fold`

每个 P0 widget 必须满足键盘-only mount/focus/edit/commit/cancel/undo/reveal/exit、
focus 不被 trap、accessible names、unsupported model 精确 source fallback。

### P1（默认切换后可继续发布）

- `html-raw-preview`

P1 widget 保持 default-off，直到被验收；不阻塞 P0 默认切换。

### Evidence 边界

- widget evidence 声明只能引用 `widget-scope.json` 的 P0/P1 列表内的 widget id；
  范围外的声明被 `scripts/check-capability-matrix.sh` 拒绝。
- 每 widget 验收需 R3 人工用例（M-R3-01..12）+ 键盘-only 完整 workflow。

### Upgrade Gate

- 任一 P0 widget 在 WYSIWYG 默认开启前未完成，则不得切换默认。
- `widget-scope.json` 的 P0/P1 划分在此 ADR 批准后冻结；变更需更新 ADR 并重新批准。
