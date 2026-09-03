# Markdown Pipeline Mode — 运维说明

> **Change:** `tiptap-v3-wysiwyg-reconciliation`（编译实现后更新，task 10.1）
> **Date:** 2026-08-31

MarkFlow 的 WYSIWYG ↔ Markdown 转换经过一个**中央 pipeline mode** 门控。本篇说明当前（完整 B 实现后）的五级模式、各自启用的行为、如何降级与回退，以及运维要点。

## 1. 模式与安全等级

模式定义于 `src/lib/editor.markdown.types.ts`：

```ts
export type MarkdownPipelineMode = 'source-only' | 'v3-compatible' | 'gated' | 'opaque' | 'reconcile';
export const MARKDOWN_PIPELINE_ORDER: readonly MarkdownPipelineMode[] =
  ['source-only', 'v3-compatible', 'gated', 'opaque', 'reconcile'];
```

`MARKDOWN_PIPELINE_ORDER` 下标越低安全等级越低；`source-only` 永远是底部 / 恢复态。`isPipelineModeAtOrBelow(a, b)` 判定 `a` 是否处于 `b` 同级或更低。

| 模式 | 载入行为 | 编辑/保存行为 | 阶段 |
|---|---|---|---|
| `source-only` | 始终留在 Source（CM6），不进入 WYSIWYG | 不产生可保存候选；原文为唯一真相 | 紧急 kill-switch / 兜底 |
| `v3-compatible` | 用 v3 bridge 解析，失败回退 Source | 汇合到 bridge 的成功候选；不启用资格/opaque/reconcile | 阶段一 |
| `gated` | **资格门禁**：`eligible` 进入 WYSIWYG；`source-only` 拒绝进入并显示稳定原因 | 不启用 opaque/reconcile | 阶段二·门禁 |
| `opaque` | 允许 `eligible-with-opaque`：可透传的空白块置为原子哨兵后进入 WYSIWYG | opaque 片段一对一片节恢复与校验 | 阶段二·opaque |
| `reconcile` | 全部上述 + 会话基线 | **三方对账**：`unchanged` 精确还原原始字节 / `safe-edit` 校验后写入 / `conflict` 抑制保存 | 阶段二·reconcile |

## 2. 各模式的启停

- **`source-only` 是综合 kill-switch**：切到 `source-only` 会清除当前会话（`endOpaqueSession`）并从原始 Markdown 重新加载 Source（task 6.6）。任何低于当前模式的降级都会**使当前 WYSIWYG 会话失效**并重跑 admission。
- **门禁用 admission（task 6.4）判定**：`classifyEligibility` 对精确源码分类，然后 `decideAdmission` 返回模式与人类可读原因（`admissionReasonLabel`）：
  - `eligible` → `gated`；
  - `eligible-with-opaque` → `opaque`（`admitOpaque` 渲染哨兵→验证 round-trip→捕获 session）；
  - 边界歧义 / 往返校验失败 / 未知语法 / 文档过大 → `source-only`。
- **server/config 控制**：pipeline 模式由内部 config 控制（`getMarkdownPipelineMode` / `setMarkdownPipelineMode`，见 `editor.state.ts`），本轮无最终用户偏好 UI。
- **保存路径**（`editor.save.reconcile.ts`）：仅 `opaque`/`reconcile` 模式接 `reconcileSave` 边界；`gated` 及以下走 legacy 序列化路径（`runSaveBoundary`）。

## 3. done 语义与三方对账（`reconcile`）

`reconcileSave` 在保存 / 切 Source 边界执行（task 8.2–8.6）：

1. 序列化当前编辑器文档；
2. 校验并恢复 opaque 哨兵（一对一、顺序、digest）；
3. 重解析候选并与当前编辑器语义指纹比较；
4. 确认源码 / 文件 revision 仍等于会话基线；
5. 分类：
   - `unchanged`：无用户 revision 且仅允许规范化差 → **返回 exact source baseline**（不重写字节，task 8.3）；
   - `safe-edit`：有用户编辑且 opaque 完整、候选重解析为当前编辑器语义 → 写入恢复候选；
   - `conflict`：任何转换错误 / 哨兵失配 / stale revision / 语义不匹配 → 不产生保存候选。

**dirty 派生**：仅由成功候选与 persisted baseline 比较得出（`deriveDirtyFromCandidate`）；过期 revision/session 结果被调度器丢弃（task 8.6）。`conflict` 设置独立 reconcile 错误态并抑制 autosave（`shouldSuppressAutosave`）。

**冲突恢复 UI**：`sidebar.conflict.ts` 让用户明确选择「保留原文并进入 Source」或「复制可恢复候选」；默认动作不覆盖磁盘，Source 不含内部表示（task 8.8）。

## 4. 回退与降级

- **降级**：把 pipeline mode 降到上一通过阶段，当前会话失效并从精确 Source 重载（task 6.6 / 10.3 降级演练）。任何 `reconcile → opaque → gated → v3-compatible → source-only` 的降级，原始 fixture 均可读取并以 Source 保存。
- **依赖回退**：若 v3 依赖迁移本身出错，可一并回退隔离的 dependency/adapter 提交 + lockfile（阶段一 5.9 已演练），无需数据迁移——磁盘 Markdown 是唯一持久化格式，从未被批量重写。

## 5. 关键模块索引

| 职责 | 模块 |
|---|---|
| 模式类型/顺序 | `src/lib/editor.markdown.types.ts` |
| bridge 门面 + 解析/序列化结果 | `src/lib/editor.markdown.bridge.ts` |
| 唯一 TipTap 专用转换边界 | `src/lib/editor.markdown.adapter.ts` |
| 资格分类 | `src/lib/editor.markdown.eligibility.ts` |
| admission 验证 / 门禁 | `src/lib/editor.markdown.admission.ts` |
| opaque 扫描 / registry / 会话 | `src/lib/editor.markdown.opaque*.ts` |
| 语义指纹 + 规范化策略 | `src/lib/editor.markdown.fingerprint.ts` |
| 三方对账 | `src/lib/editor.markdown.reconcile.ts` |
| 保存边界决策 | `src/lib/editor.save.reconcile.ts` |
| 模式读写 / dirty | `src/lib/editor.state.ts` |
| 会话生命周期（加载/清除） | `src/lib/editor.markdown.opaque.session.ts` |

## 6. 复现命令

```bash
# 单元/回归
npm test

# 类型 + 构建
npx tsc --noEmit && npm run build

# 门禁证据（规范化的命名测试 + 差分语料门禁）
npx vitest run src/lib/editor.markdown.canonicalization.test.ts src/lib/stage1-differential-gate.test.ts

# admission / reconcile 性能阈值（task 9.4）
npx vitest run src/lib/editor.admission-reconcile-benchmark.test.ts
```
