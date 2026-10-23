# Tasks

## 1. 同步 delta spec 到主规范

- [x] 1.1 把 `compact-frontmatter-properties/specs/frontmatter-visual-editor/spec.md` 的 3 条 ADDED Requirement（「Properties use a compact inline presentation」「Property names values and list items are directly editable」「Property actions are available through context menus and reordering affordances」）连同全部 Scenario 追加到 `openspec/specs/frontmatter-visual-editor/spec.md` 的 `## Requirements` 段末尾；验证：`grep -c "### Requirement:"` 主规范由 7 增至 10，`grep -F "### Requirement: Properties use a compact inline presentation"` 有命中，diff 中既有 7 条 Requirement 标题与正文无改动。
- [x] 1.2 在 `openspec/specs/frontmatter-visual-editor/spec.md` 的 `Agent Context` 追加一行说明紧凑内联形态与统一菜单宿主复用；验证：该段为纯追加（diff 只有 `+` 行），且 `grep -n "紧凑" openspec/specs/frontmatter-visual-editor/spec.md` 有命中。
- [x] 1.3 把 `editor-default-context-menu/specs/context-menu/spec.md` 的 2 条 ADDED Requirement（「编辑区域默认编辑菜单」「统一右键菜单视觉与子菜单」）连同全部 Scenario 追加到 `openspec/specs/context-menu/spec.md` 的 `## Requirements` 段末尾；验证：`grep -F "### Requirement: 编辑区域默认编辑菜单"` 与 `grep -F "### Requirement: 统一右键菜单视觉与子菜单"` 均有命中，既有 6 条 Requirement 无改动（总数 6 → 8）。
- [x] 1.4 让 `openspec/specs/context-menu/spec.md` 的 `ContextMenuItem` 代码块、DOM 结构与 `Agent Context` 反映已合入实现（`icon` / `disabled` / `shortcut` / `submenu`，子菜单键盘展开与视口翻转，调用方含 `editor-context-menu.ts` 等）；验证：`grep -n "submenu" openspec/specs/context-menu/spec.md` 有命中，且 `src/ui/context-menu.ts` 的 `ContextMenuItem` 字段全部出现在代码块中。
- [x] 1.5 预演归档门禁：对两个 delta 的每条 `### Requirement:` 名称在主规范中做 `grep -F` 校验；验证：5 条全部 OK，无 missing。

## 2. 归档两个变更

- [x] 2.1 归档 `compact-frontmatter-properties`：`npx openspec archive compact-frontmatter-properties --yes`；验证：目录移动到 `openspec/changes/archive/2026-10-23-compact-frontmatter-properties/`，`npx openspec list --json` 不再包含该变更（输出 `Specs already in sync; no files changed`，证明 1.1-1.2 的同步已覆盖 delta）。
- [x] 2.2 归档 `editor-default-context-menu`：`npx openspec archive editor-default-context-menu --yes`；验证：目录移动到 `openspec/changes/archive/2026-10-23-editor-default-context-menu/`，`npx openspec list --json` 不再包含该变更。
- [x] 2.3 归档本变更 `archive-pending-changes`；验证：`ls openspec/changes | grep -v archive` 输出为空。

## 3. 门禁验证

- [x] 3.1 `npx openspec validate --all`；验证：退出码 0，Totals `73 passed, 0 failed`。
- [x] 3.2 `bash scripts/check-archive-synced.sh`；验证：退出码 0，两个新归档各报 `all content synced`（`2026-10-23-compact-frontmatter-properties`、`2026-10-23-editor-default-context-menu`），末尾为 `OK: all archived delta specs ... are synced to main specs`。
- [x] 3.3 `node scripts/check-layering.mjs`；验证：退出码 0，`layering gate: no violations`。
- [x] 3.4 `npm test`（90 文件 / 897 用例全过）、`npx tsc --noEmit`（退出码 0）、`npm run build`（vite 构建成功）；本变更不改产品代码，结果与 `main` 一致。
- [x] 3.5 独立复核（静态走查 + 上述门禁）；验证：分支 diff 仅涉及 `openspec/`，无产品代码改动，门禁全绿。

## Workflow follow-up

- 合入后观察一次 CI，确认 `archive-sync` 与 `openspec` 门禁在新归档下稳定。
