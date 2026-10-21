# Proposal

## Why

代码清理方案 `docs/cleanup-plan/` 的 **P0 安全与文档项已全部落地**（#332 移除了 `write_file_binary` 任意写盘，#333 移除了生产路径 `lock().unwrap()` panic，#256 归档了 `docs/markflow-core-stages/` 并清除了重复的 `openspec/changes/`），P1 死代码清扫部分落地（#300 清理了无调用方导出、废弃依赖与一次性产物），但 **P1 去重（6–9）、P2 拆分（12–17）与 P2 分层（18–20）整体未动工**，多个目标文件行数反而高于基线。同时该目录仍以「方案草案，待 review 后按 issue 逐个落地」的面貌存在，`priority.md` 中的条目既无完成标记也无未完成项的去向；`docs/bundle-baseline.md` 仍是 2026-07-19 的快照（8.7 MB / 72 文件，Top3 为 `mermaid.core` 627 kB、`wardley` 616 kB、`index` 551 kB），与 PR #331 变更 chunk 拆分后的实际产物（`mermaid.core` 687K、`cynefin` 675K、`vendor-prosemirror` 512K、`index` 463K）及 `vite.config.ts:26` 的 `chunkSizeWarningLimit: 720` 均已不符，容易被误读为当前断言基线。现在做最后的文档收尾。

## What Changes

- `docs/bundle-baseline.md` 头部增加历史基线横幅：记录日期、已过期、非当前断言基线、重新生成方式（`npm run analyze`，产物写入 `docs/bundle-report.html`，该文件不入 git）。
- 正文更新为「历史快照」表述，并补充当前实际产物的大致对照说明，避免读者把旧数字当作当前阈值；真正的体积门禁指向 `bundle-budget` 规范与 `npm run check-size`。
- `docs/cleanup-plan/priority.md` 逐项标注落地状态：已完成项写明「已完成 + PR/issue 链接」，未完成项统一标注「未完成 → #337」（新建的遗留项跟踪 issue）。
- `docs/cleanup-plan/README.md` 头部状态从「方案草案，待 review」改为「方案已收口」，并列出已完成 / 已转出项与归档位置。
- 将 `docs/cleanup-plan/` 归档到 `docs/archive/cleanup-plan/`。
- 同步更新 `src/lib/field-scan.test.ts` 的 `DOCS` 语料库路径（`docs/cleanup-plan/code-standards.md` → 归档后路径），使 field-scan 门禁继续把该文档纳入扫描。
- 全局 grep 确认无其他失效引用残留。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change moves and re-labels documentation and updates a test's file-path constant. No product or spec-level behavior changes, so the change sets `skip_specs: true` in `.openspec.yaml`.

## Impact

- 文档：`docs/bundle-baseline.md`、`docs/cleanup-plan/{README,priority,analysis,code-standards}.md`（路径迁移到 `docs/archive/cleanup-plan/`）。
- 测试：`src/lib/field-scan.test.ts` 的 `DOCS` 常量（含 `evidence/field-scan-summary.json` 中记录的历史路径，该文件为一次性产物、不作为断言源）。
- 无代码逻辑、无 API、无依赖、无构建配置变更。
- 验收：`npm test`（含 field-scan）、`npx tsc --noEmit`、`npm run validate:openspec`，并确认无失效路径 / 断链。
