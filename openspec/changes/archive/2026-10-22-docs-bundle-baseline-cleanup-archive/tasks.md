# Tasks

## 1. Bundle 基线文档去误导

- [x] 1.1 在 `docs/bundle-baseline.md` 顶部加入醒目状态横幅：记录日期 2026-07-19、`状态：历史基线（已过期）`、与当前产物的差异、`npm run analyze` 重新生成方式，以及权威体积门禁指向 `openspec/specs/bundle-budget` 与 `npm run check-size`；验证：横幅出现在任何表格之前，且文中不再出现「当前基线」这类无限定表述。
- [x] 1.2 将 `docs/bundle-baseline.md` 正文的表述改为历史快照口径，补充「与当前产物对照」（实测 `mermaid.core` 687K / `cynefin` 675K / `vendor-prosemirror` 512K / `index` 463K，`vite.config.ts` 的 `chunkSizeWarningLimit: 720`）并明确标注该对照为撰写时的一次性测量、非持续断言；验证：`grep` 全文确认每个数字旁都有历史/一次性限定语。

## 2. cleanup-plan 状态收尾

- [x] 2.1 逐项为 `docs/cleanup-plan/priority.md` 的 1–25 条标注状态：已完成项写「已完成 + PR/issue 链接」（#332/#333/#256/#300 等），未完成项统一写「未完成 → #337」（遗留项跟踪 issue，已创建）；验证：表内每一条都有状态标记，无空缺。
- [x] 2.2 更新 `docs/cleanup-plan/README.md` 头部状态为「方案已收口（归档）」，并列出已完成项摘要、未完成项统一指向跟踪 issue #337、以及归档位置；验证：README 首屏即可看出方案已结束而非待办。
- [x] 2.3 在 `docs/cleanup-plan/analysis.md` 头部加同样的归档横幅，并补一条说明：`openspec/changes/archive/**` 与 `evidence/field-scan-summary.json` 中出现的 `docs/cleanup-plan/` 路径属历史记录，指向归档后位置；验证：读者据该说明不会误判为断链。

## 3. 归档目录迁移与引用同步

- [x] 3.1 用 `git mv docs/cleanup-plan docs/archive/cleanup-plan` 迁移目录，并创建 `docs/archive/` 目录；验证：`git status` 显示为 rename 而非删除+新增。
- [x] 3.2 修正迁移后四个文件内部的相对链接（指向 `../` 的目标需重新计算）；验证：逐个检查文件内所有相对链接指向存在的文件。
- [x] 3.3 更新 `src/lib/field-scan.test.ts` 的 `DOCS` 常量：`docs/cleanup-plan/code-standards.md` → `docs/archive/cleanup-plan/code-standards.md`；验证：`npx vitest run src/lib/field-scan.test.ts` 通过且扫描文档数量不变（≥30）。

## 4. 全局引用核查与验证

- [x] 4.1 全局 grep `cleanup-plan` 与 `bundle-baseline`，确认除 `openspec/changes/archive/**`（历史记录）与 `evidence/field-scan-summary.json`（一次性产物）外无遗留的旧路径引用；验证：grep 结果逐条分类并确认无遗漏的活引用。
- [x] 4.2 运行 `npm test`、`npx tsc --noEmit`、`npm run validate:openspec`，确认全部通过；验证：三条命令均以退出码 0 结束。

## 5. 变更收尾

- [x] 5.1 在 `openspec/changes/docs-bundle-baseline-cleanup-archive/tasks.md` 中勾选全部已完成任务；验证：`openspec status --change docs-bundle-baseline-cleanup-archive --json` 显示所有 artifact 为 done。
