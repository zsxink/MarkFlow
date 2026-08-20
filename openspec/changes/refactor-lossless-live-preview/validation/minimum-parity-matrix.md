# P3 minimum parity matrix — default minimum parity (task 5.10)

> 状态约定：每一行必须由 Program Owner 逐行签署 `PASS` / `FALLBACK-ACCEPTED` / `FAIL`。
> 下表「自动化证据」列由实现 AI 填充（只填**已验证**的自动化/代码证据，不伪造）；
> 「Program Owner 结论」列初始为 **PENDING**，必须等待人工逐行确认后才可标记。
> 在 Program Owner 逐行签署前，`losslessCoreSession` / `codemirrorLivePreview` 默认
> 入口保持「未获准发布」（gate 未开），即使代码已默认开启也不得视为获批（task §9）。

| # | 能力行（design P3 §3） | 自动化证据（已验证） | Program Owner 结论 |
| --- | --- | --- | --- |
| 1 | heading/strong/emphasis/strike/inline code/link/quote/list/fence 语义样式可辨认；marker 弱化且活动范围完整 reveal | **PASS（自动化）**：P2 已验收语义样式（`p2-acceptance.e2e.mjs` P2 15 项 + `projection.test.ts` 11 项 + `commandMatrix.test.ts`/`commandRouter.test.ts`）。P3 命令矩阵 20 项 + 命令路由 38 项全绿 | PENDING |
| 2 | toolbar/shortcut/Enter/Backspace/paste/Undo/Redo；Source/Live Preview 同一 History | **PASS（自动化）**：`commandRouter.test.ts`（toolbar/keyboard/linkDialog 路由到 active lossless view）；`commandMatrix.test.ts` 20 项（Enter/Backspace 矩阵）；`historyBoundary.test.ts` 5 项（paste+typing 两 group、结构命令各自 group、单 History owner）；`imagePaste.test.ts` 4 项 | PENDING |
| 3 | image 插入/路径修改/删除/资源失败补偿；安全可编辑 source fallback | **PASS（自动化）**：`imageSourceRange.test.ts` 12 项（精确 source range）；`commandRouter.test.ts` 图片 ops 7 项（replace/delete 只改对应 range、空行保留、Undo）；`imagePaste.test.ts` 4 项（资源失败不插入）；`lifecycle.test.ts` 保存图片迁移局部 patch | PENDING |
| 4 | table/task/frontmatter/reference/footnote/diagram/raw HTML → exact source fallback（可读/可选/可编辑/可复制/可保存） | **PASS（自动化，FALLBACK-ACCEPTED 候选）**：`commandMatrix.test.ts` table/image Enter 均回退 plain local CM 文本；`exportLossless.test.ts` 渲染管道；source fallback 下可编辑/复制由 CM 原生保证。P4B widget 明确延后 | PENDING |
| 5 | selection/IME/accessibility：基础 constructs 不跳光标、不丢 composition；键盘可进出 fallback range | **PASS（自动化）**：`commandMatrix.test.ts` CJK/emoji（UTF-16/surrogate 安全）；`p2-acceptance.e2e.mjs` 中文 IME 近 marker、Undo/Redo、marker 可编辑进入；`historyBoundary.test.ts` 跨模式 Undo。组合键/真 IME 桌面依赖人工确认 | PENDING |
| 6 | data/save：canonical L0/L1、autosave/conflict/reconcile、A/B 隔离全部通过 | **PASS（自动化）**：`lifecycle.test.ts` 23 项（零编辑两 tick 无写、real edit→save、reload、A/B、lost commit/write reconcile、save-as、写盘期间继续输入保持 dirty）；`main.lifecycle.guard.test.ts` 19 项（默认 flags 零编辑 LF/CRLF/CR/Mixed/BOM/tail0-3）；`test:byte-contract` 93 fixtures；Rust core 93/tauri 151 | PENDING |

## 累积判定

- 独立 Reviewer **GO**（`70f314c`，六点全 PASS，F1-F4 全部 resolved）：见
  `evidence/P3/20260821-p3-reviewer-final-70f314c/REVIEW.md`。
- `losslessCoreSession` 默认开启：在 Program Owner 逐行签署全部行为 `PASS` 或
  明确接受 `FALLBACK-ACCEPTED` 前，**保持未获准发布**（不宣称 P3 GO）。
- 任一行为 FAIL 或 fallback 不可编辑，或 data/save 项失败 → 立即关闭默认 flag。
- 人工结论待填：见 P3.md 「人工验证记录」。

## 证据定位

- 全 gate 结果见 `evidence/P3/20260820-p3-start-95f215b/`（基线）与
  `evidence/P3/20260821-p3-implementation-5.1-5.9/`（实现）。
- 命令矩阵/路由/图片/粘贴测试在 `src/lib/lossless/*.test.ts`（512 项全绿）。
- 桌面语义/视觉证据依赖 Program Owner desktop run（2026-08-21 agent 会话无法
  保持 Tauri/WebKit GUI 存活；P2 桌面 E2E 在交互会话已验证为 green）。