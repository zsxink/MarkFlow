# Design

## Context

See `proposal.md` — Why. 现状约束：

- `openspec/changes/` 下只有 `bundle-chunk-optimization` 与 `source-mode-soft-wrap` 两个存量目录；前者 `skip_specs: true` 且无 `specs/`，后者有一条 delta（`specs/codemirror-source-editor/spec.md`），含 2 条 ADDED Requirement。
- 主规范 `openspec/specs/codemirror-source-editor/spec.md` 已有 16 条 Requirement，`Agent Context` 段落列出源码入口与不变量，但没有提到运行时 Compartment。
- 源码实现已在 `main` 上：`src/lib/editor.source.ts:20-22` 定义了 `readOnlyCompartment` / `highlightCompartment` / `softWrapCompartment` 三个模块级 Compartment，`setSourceSoftWrap()` 在无 view 时只记录状态（`editor.source.ts:41-47`），`createSourceEditor()` 用 `softWrapEnabled ?? settings.softWrap !== false` 作为初值（`editor.source.ts:150`）。`src/components/settings.ts:460` 在 `applyRuntimeSettings()` 里下发。
- 单测已覆盖：`src/lib/editor.source.test.ts` 的 `source editor soft wrap compartment` 组（初始 `cm-lineWrapping`、`setSourceSoftWrap(false)` 后 class 消失且 `getSourceView()` 引用不变、切回恢复、无 view 时切换不抛错且下次创建沿用）。
- `openspec archive <name>` 自己会尝试把 delta 合并进主规范，且对「delta 内容与主规范逐字相同」的 ADDED 视为已同步（`specs-apply.js` 的 identical-content skip）。因此先手工 sync、再 archive 是幂等的。
- 归档门禁 `scripts/check-archive-synced.sh` 只扫描 `changes/archive/**`，对尚未归档的 delta 无感知；`CUTOFF_DATE` 默认 `2026-07-21`，本次归档日期 `2026-10-22` 落在门禁范围内。

## Goals / Non-Goals

**Goals:**

- 主规范与已合入的实现对齐：`codemirror-source-editor` 补齐两条 Requirement，`Agent Context` 记录三个 Compartment 的运行时切换契约。
- 两个 change 目录进入 `openspec/changes/archive/2026-10-22-<name>/`，`openspec/changes/` 只剩 `archive`。
- `source-mode-soft-wrap/tasks.md` 的 4.3 / 4.4 以可核对的方式勾选完成，而不是空勾。

**Non-Goals:**

- 不改任何产品代码、测试代码、构建配置（实现与测试均已合入）。
- 不改 `scripts/check-archive-synced.sh` 的门禁策略（未归档 delta 的盲区需单独提案）。
- 不回溯修改 PR #329 / #331 的历史。

## Decisions

1. **先 sync 再 archive，不依赖 archive 的隐式合并。** 虽然 `openspec archive` 也会合并 delta，但 §4.4 明确要求「先 sync 再移动目录」，且先 sync 让主规范的编辑（追加 `Agent Context` 说明）与 delta 合并分离——若 archive 的合并在校验阶段失败，主规范不会处于半同步状态。备选「只跑 archive 让 CLI 合并」被否决：无法在同一轮内补 `Agent Context`，且违反流程规范。

2. **`Agent Context` 补充以「Compartment 契约」为单位，不逐函数复述。** 新增一段说明：readOnly / highlight / softWrap 三个 Compartment 各自独立 reconfigure，切换不重建 view；`setSourceSoftWrap()` 在无 view 时暂存取值供下次创建使用。理由：`Agent Context` 是给后续 agent 的定位线索，重复 delta 里的场景文字会随规范演化漂移。

3. **4.3 的手测项按「可自动验证 / 需真实渲染」拆开记录，不伪造手测。** 可自动验证的部分引用已有单测与 `@codemirror/view` baseTheme 源码事实（`.cm-scroller { overflowX: auto }`、`.cm-content { whiteSpace: pre }`、`.cm-lineWrapping` 提供折行）；需要真实窗口才能观察的部分（横向滚动的手感、WYSIWYG 下切换的观感）标注为「本次未在真实窗口执行，结构与单测已覆盖」，并给出后续可补的 e2e 入口。备选「直接勾选手测完成」被否决：无证据的勾选正是本 issue 要修的档案问题。

4. **归档顺序：先 `source-mode-soft-wrap`（含 delta），后 `bundle-chunk-optimization`（无 delta）。** 若前者 sync 或校验失败，后者尚未移动，回滚面更小。

5. **归档目录名用 `2026-10-22-<change-name>`（CLI 默认），不做手工改名。** 与既有归档命名一致：`ls openspec/changes/archive | wc -l` 当前为 81（本变更归档后为 82），每个归档名都是 `YYYY-MM-DD-<change-name>` 格式。

## Risks / Trade-offs

- **[Risk]** `openspec archive` 对已手工同步的 ADDED 报错而非跳过 → **Mitigation:** 已核对 `specs-apply.js` 的 identical-content 分支；执行后立即确认目录确实移动，失败则按 CLI 报错定位（不手工 mv 绕过）。
- **[Risk]** 编辑主规范时手误删掉既有 Requirement → **Mitigation:** 只做「追加」与「`Agent Context` 单段新增」，保留既有 16 条 Requirement 的标题和实质文本，不删除或改写；原始 diff 中的格式分隔符（如空行）可能变化，Verifier 会 `git diff` 复核，并由 `openspec validate --all --strict`（如可用）与 `check-archive-synced.sh` 双重把关。
- **[Risk]** 4.3 记录「未真实窗口手测」被读成验证缺失 → **Mitigation:** 在同一行写清已覆盖的证据来源与未覆盖项，并把 e2e 补测列为后续事项，避免含糊的「已验证」。
- **[Trade-off]** 不扩展 `check-archive-synced.sh` 去覆盖未归档 delta → 盲区仍在，但把门禁策略变更与本次归档收尾分开，便于独立评审。

## Migration Plan

1. 手工 `openspec-sync-specs` 语义：把 delta 的两条 ADDED Requirement 追加到主规范，并在 `Agent Context` 补 Compartment 说明。
2. 更新 `source-mode-soft-wrap/tasks.md` 4.3 / 4.4。
3. `openspec archive source-mode-soft-wrap --yes`，确认目录移动。
4. `openspec archive bundle-chunk-optimization --yes`，确认目录移动。
5. `npx openspec validate --all` + `bash scripts/check-archive-synced.sh`。

回滚：全部改动都是文件移动与文档新增，`git checkout -- openspec/` 或 `git reset --hard origin/main` 即可恢复。
