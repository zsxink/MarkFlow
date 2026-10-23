# Design

## Context

- `openspec/changes/` 当前有三个非归档目录：`compact-frontmatter-properties`、`editor-default-context-menu`、以及本次新建的 `archive-pending-changes`。
- 两个待归档变更的 `tasks.md` 全部勾选（`grep -c "^- \[ \]"` 为 0），`openspec status --change <name> --json` 的四个 artifact 全为 `done`，`npx openspec validate <name> --strict` 通过。实现早已随 PR #363（`c224bc2`）合入 `main`。
- delta spec 与主规范的实际差距：
  - `compact-frontmatter-properties/specs/frontmatter-visual-editor/spec.md`：3 条 ADDED Requirement（紧凑内联展示、就地编辑、菜单/拖拽操作），主规范 `openspec/specs/frontmatter-visual-editor/spec.md` 中 0 条命中。
  - `editor-default-context-menu/specs/context-menu/spec.md`：2 条 ADDED Requirement（默认编辑菜单、统一视觉与子菜单），主规范 `openspec/specs/context-menu/spec.md` 中 0 条命中；且主规范的 `ContextMenuItem` 定义与 `Agent Context` 仍停留在子菜单能力引入之前（缺 `icon` / `disabled` / `shortcut` / `submenu`，`src/ui/context-menu.ts:10-26` 已是新版）。
- `openspec archive <name> --yes` 自己也会合并 delta，且对「delta 内容与主规范逐字相同」的 ADDED 视为已同步，因此「先手工 sync 再 archive」是幂等的（`2026-10-22-archive-pending-changes` 已验证过同一路径）。
- `scripts/check-archive-synced.sh` 只扫描 `changes/archive/**`，`CUTOFF_DATE` 默认 `2026-07-21`；本次归档日期 `2026-10-23` 落在门禁范围内，归档后会被逐条校验 Requirement 名称。

## Goals / Non-Goals

**Goals:**

- 两个已完成变更的 delta 逐条进入主规范，主规范的 `Agent Context` / API 段与已合入实现对齐。
- 两个 change 目录进入 `openspec/changes/archive/2026-10-23-<name>/`，`openspec/changes/` 只剩 `archive`。
- 归档后 `openspec validate --all`、`check-archive-synced.sh`、`check-layering.mjs` 全绿。

**Non-Goals:**

- 不改产品代码、测试代码、样式、构建配置（实现与测试均已合入）。
- 不改 `scripts/check-archive-synced.sh` 的门禁策略（未归档 delta 的盲区需单独提案，见 Issue #369 只要求消除存量项）。
- 不改两个变更 `tasks.md` 的勾选状态（已全部勾选且证据充分）。

## Decisions

1. **先 sync 再 archive，不依赖 archive 的隐式合并。** `AGENTS.md` 强制要求「先同步 delta spec，再搬目录」，且先 sync 让「补 `Agent Context`」与「delta 合并」两步分离：若后续归档校验失败，主规范不会处于半同步状态。备选「只跑 `openspec archive` 让 CLI 合并」被否决：无法在同一轮补 `Agent Context` 与 API 段，且违反流程规范。

2. **主规范补充以「契约」为单位，不逐函数复述。** `context-menu` 的 `Agent Context` 增加一行说明菜单工厂已支持 `icon`/`disabled`/`shortcut`/`submenu` 与子菜单键盘展开、视口翻转，调用方含 `editor-context-menu.ts`、`table-context-menu.ts`、`diagram-context-menu.ts` 等；`frontmatter-visual-editor` 的 `Agent Context` 增加一行说明属性面板为紧凑内联形态、辅助操作走统一菜单宿主。理由：`Agent Context` 是给后续 agent 的定位线索，重复 delta 的场景文字会随规范演化漂移。

3. **`context-menu` 主规范的 `ContextMenuItem` 代码块按实现补齐，不新增 Requirement。** 该代码块是对现有 API 的说明性片段，落后于实现会让后续 agent 写出不存在的接口；补齐字段不改变规范语义，也不需要 delta。

4. **归档顺序：先 `compact-frontmatter-properties`，后 `editor-default-context-menu`。** 前者 delta 与主规范差距更大（3 条 Requirement 全缺），先做暴露问题更早；两者互不依赖，顺序只影响失败时的回滚面。

5. **归档目录名用 `2026-10-23-<change-name>`（CLI 默认），不手工改名。** 与既有归档命名一致。

6. **本次变更自身 `.openspec.yaml` 设 `skip_specs: true`。** 本次只搬目录 + 同步既有 delta，不引入新的规范语义；`openspec validate` 对零 delta 变更要求该标记。

## Risks / Trade-offs

- [sync 时改写既有 Requirement 文本，丢失历史措辞] → 只做纯追加：新增 Requirement 追加到 `## Requirements` 末尾，既有 Requirement 标题与正文不改；`Agent Context` 只追加行。
- [归档后 `check-archive-synced.sh` 因 Requirement 名称细微差异报红] → 归档前用脚本同款逻辑预演：逐条 `grep -F "### Requirement: <name>"` 主规范。
- [两个 change 目录被 `mv` 后 git 视为删除 + 新增，diff 噪声大] → 用 `openspec archive --yes`（内部 `mv`），git 会识别为 rename，`git diff --stat` 显示为 0 变更的路径移动。

## Migration Plan

无数据迁移。回滚方式：`git checkout main -- openspec/` 或 `git mv openspec/changes/archive/2026-10-23-<name> openspec/changes/<name>`。
