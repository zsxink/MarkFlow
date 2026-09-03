# Stage Two Validation Report — TipTap v3 WYSIWYG Reconciliation（Full B）

**Change:** `tiptap-v3-wysiwyg-reconciliation`
**Branch:** `refactor/issue-258-tiptap-v3-wysiwyg-reconciliation`
**Date:** 2026-08-31

本篇汇总阶段二（完整方案 B：资格门禁 `gated` → opaque → reconcile）的出口门禁、已知规范化、source-only 原因、性能阈值与回退/降级证据。阶段一证据见 `stage-1-validation.md`（已完成并获维护者批准）。

## 1. 阶段二出口门禁

设计 Decision 9 定义的阶段二 exit gates，均以**自动化测试**通过作为 PASS：

| 出口门禁 | PASS 条件 | 证据（测试） | 结果 |
|---|---|---|---|
| **gated** | 语料每个样例都有确定性 eligibility；所有 `source-only` 样例在盘上逐字节不变 | `editor.eligibility.test.ts`、`editor.admission.test.ts`、`editor.admission-ui.test.ts`（source-only 不重写、不销毁 CM6） | **PASS** |
| **opaque** | 碰撞 / 缺失 / 重复 / 重排 slot、剪贴板、无泄漏测试通过 | `editor.markdown.opaque.registry.test.ts`、`opaque.bridge.test.ts`、`opaque.extension.test.ts`、`opaque.clipboard.test.ts`、`opaque.session.test.ts` | **PASS** |
| **reconcile** | unchanged / safe-edit / conflict 矩阵、autosave 抑制、外部 reload、恢复 E2E 通过 | `editor.reconcile.test.ts`、`editor.reconcile.session.test.ts`、`editor.save.reconcile.test.ts`、`sidebar.conflict.test.ts`、`sidebar.fileops.test.ts` | **PASS** |
| **性能阈值（task 9.4）** | 正常档 admission/reconcile 不越过 1.4 的 source-only 阈值 | `editor.admission-reconcile-benchmark.test.ts`（见 §3） | **PASS** |
| **清理（section 9）** | 移除长度启发式与 lossy fallback 持久化职责；无 v2 过渡代码 | `rg` 零引用 + §5 | **PASS** |

## 2. 已知规范化（命名测试，task 9.3）

迁移允许的 7 个语义中性输出差异，`editor.markdown.fingerprint.ts` 的 `CANONICALIZATIONS` 登记，`editor.markdown.canonicalization.test.ts` 为**每个**提供命名行为测试（7/7，见 `docs/wysiwyg-reconciliation/migration-comparison-report.md` §3）：

`link-href-escaping`、`table-column-padding`、`table-pipe-escaping`、`file-tail-newline`、`soft-break-normalization`、`list-continuation-indent`、`code-trailing-newline`

## 3. 性能与 source-only 阈值（task 1.4 / 9.4）

实测（`editor.admission-reconcile-benchmark.test.ts`，阈值 19.4ms = v2 基线 15.5ms × 1.25）：

| 文档 | 阶段 | 实测中位数 | 阈值 | 结论 |
|---|---|---|---|---|
| small | admission | 0.33ms | 19.4ms | ✔ 余量充足 |
| medium (5.4KB) | admission | 6.4ms | 19.4ms | ✔ 余量充足 |
| opaque-heavy（25 片段 + frontmatter） | reconcile | 0.55ms | 19.4ms | ✔ 余量充足 |
| opaque-heavy（25 片段 + frontmatter） | admission | 1.46ms | — | source-only 阈值证据 |

正常档文档 admission/reconcile 均远低于 source-only 阈值，**无需**按大小分级降级。大/密集文档（stage-1 实测 54KB ~380ms parse）依既有阈值降级 Source（阶段一记录）。

## 4. source-only 原因（稳定、无正文、用户可读）

`classifyEligibility` 产出、`admissionReasonLabel` 本地化为用户可读：

- `supported` — 语法完全受支持 → WYSIWYG
- `opaque-covered` — 含暂不支持的保留片段（frontmatter / html-block / html-comment）→ 若可安全透传则 opaque，否则 Source
- `parse-verification-failed` — 往返校验未通过
- `ambiguous-boundary` — 未闭合/歧义边界
- `construct-crosses-boundary` — 跨越受支持与保留区域的语法
- `unknown-construct` — 暂不支持的语法
- `too-large` — 文档过大
- `manual` — 手动确认

诊断 `MarkdownConversionError` 只含 `stage`/稳定 `code`/`range`/`length`/`digest prefix`，**不含**正文、opaque 载荷、带 query 的 URL 或图表源码（task 2.5 / 9）。

## 5. 清理残留验证（task 9.1 / 9.2）

- `checkSerializationIntegrity` 长度启发式：删除（`src/lib/editor.helpers.ts`），`rg` 零引用。
- `extractDocAsFallback` 的持久化职责：删除无调用代码（`src/lib/editor.serializer.ts`），`rg` 零引用。
- v2 `storage.markdown` 过渡分支：从 `editor.markdown.adapter.ts` 移除（v3 `editor.getMarkdown()` 唯一）。
- 依赖：全部 `@tiptap/*` 为单一 `3.30.5` patch；无 `tiptap-markdown`、`@tiptap/extension-task-list/task-item`、`@tiptap/extension-table-row/cell/header`（`npm ls` 干净 + lockfile 扫描为零）。
- `markdown-it` 仅保留于测试/基准（v2 差分基线），非生产代码，符合设计。

## 6. 回退 / 降级验证（task 10.3）

- **阶段一 5.9 回退演练**：在隔离 temp worktree 的 v2 基线（`9148537`）上 `npm install` + `npm run build` 复原 v2 构建；同一批 fixture 均为 `.md`、无数据迁移即可打开。记录于 `stage-1-validation.md` §5.9。
- **降级 kill-switch（task 6.6 / admission-ui.test）**：`degradeToSourceOnly()` 清除当前会话并从**原始** Markdown（`lastPersistedMarkdown`）重载 Source，绝不用规范化后的编辑器序列化回写。逐级降级 `reconcile → opaque → gated → v3-compatible → source-only` 时，原始 fixture 均可读取并以 Source 保存（会话被 `onPipelineModeChanged` 清除，见 `opaque.session.test.ts`）。

## 6b. 关键 Tauri E2E（task 9.7）

- 以 `npm run test:e2e` 构建 Tauri debug 二进制并在真实桌面窗口（Aqua 会话）运行 smoke 套件，**exit 0、零失败**。WDIO 汇总 `1 passed, 6 skipped, 7 total`——6 个 skipped 仅因子 spec 导出 `register*Tests` 函数、由 `all-smoke.e2e.mjs` 合并执行，其内 6 组断言**全部在单一真实 Tauri 实例中随后通过**：

  | E2E 路径（task 9.7） | 断言 | 结果 |
  |---|---|---|
  | 打开 → WYSIWYG | `file-open`: 打开 welcome.md 显示结构化内容 | PASS |
  | WYSIWYG ⇄ Source 切换 | `editor-mode`: 编辑内容跨两种模式保持 | PASS |
  | 编辑 → 保存 → 重载 | `edit-save-reload`: 写入磁盘并持久 | PASS |
  | 磁盘逐字节（no-edit） | `disk-safety` (5.5): 无编辑 fixture 打开/切换/保存/重载后**逐字节**一致（仅 `file-tail-newline` 允许） | PASS |

- **覆盖边界（如实登记）**：`source-only` / `opaque` / `conflict` 恢复路径**未**以 E2E spec 覆盖，改由**单元/组件测试**覆盖且全绿：`editor.admission-ui.test.ts`（source-only 拒绝 + kill-switch 重载原始 Source）、`editor.opaque.integration.test.ts`（opaque admission/restore）、`sidebar.conflict.test.ts` + `editor.save.reconcile.test.ts` + `sidebar.fileops.test.ts`（conflict 抑制写入、unchanged 不写盘）。真实输入型交互（真实图片粘贴/拖放、图表 node-view 渲染、手动表格编辑）与阶段一 5.7 一样留给维护者最终验收。

## 7. 汇总

阶段二各出口门禁全部 PASS；7 个规范化全部有命名测试；source-only 原因稳定且无正文；性能远低于阈值；清理无残留；回退与降级均可恢复原始 fixture。与阶段一交付门禁（§10）一起，作为合入/归档前的证据基线。

## 8. 复跑命令

```bash
npm test                                   # 全部回归（含阶段一二）
npx tsc --noEmit && npm run build          # 编译 + 生产构建
npx vitest run src/lib/editor.markdown.canonicalization.test.ts   # 规范化命名测试
npx vitest run src/lib/editor.admission-reconcile-benchmark.test.ts  # 性能阈值
npx vitest run src/lib/editor.stage2-gate.test.ts src/lib/editor.admission-ui.test.ts  # 门禁/降级
```
