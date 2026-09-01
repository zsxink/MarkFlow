# New-Engine Migration Comparison Report — 完整 Fixture 语料

> **Change:** `tiptap-v3-wysiwyg-reconciliation`（section 9 cleanup / task 9.3）
> **Date:** 2026-08-31
>
> 本篇报告对比旧引擎（v2：markdown-it / tiptap-markdown 0.8.10）与新引擎（v3：`@tiptap/markdown` 3.30.5 / marked）在整个**固定 round-trip fixture corpus** 上的迁移结果，断言所有受支持样例**无新增**文本/结构/属性损失，并为每个允许规范化登记一个**命名测试**。

## 1. 断言摘要

| 类别 | 断言 | 结果 |
|---|---|---|
| 支持语法全集 | 全部 24 个 `supported` fixture 经 v3 引擎 parse→serialize→parse 结构完整 | **PASS**（`tiptap-v3-spike.test.ts` 全绿） |
| 文本/结构/属性零新增损失 | 24 个 supported fixture 与 v2 基线相比无**新增**文本、结构或 authored 属性损失；每个 v2/v3 输出差异都是登记的规范化或已修复缺陷 | **PASS**（`stage1-differential-gate.test.ts`，`differential-corpus-summary.json`） |
| 规范化的命名测试 | 7 个允许规范化**每一个**都有命名行为测试 | **PASS**（`editor.markdown.canonicalization.test.ts` 7/7，见 §3） |
| 异常输入 | 2 个 `invalid` fixture 分类正确，不进入可保存候选 | **PASS** |

## 2. 语料覆盖

语料定义于 `src/lib/wysiwyg-roundtrip.fixtures.ts`（26 个 fixture，13 个类别，24 supported + 2 invalid），覆盖：

标题（正常/极深）、行内标记（粗体/斜体/删除线/行内码/嵌套）、链接（基本/转义目标）、图片（本地/远程）、软硬换行、嵌套列表（基本/续行）、任务列表（基本/嵌套）、GFM 表格（基本/空单元格+转义竖线）、普通代码块（基本/尾随换行）、Mermaid（基本/空白）、PlantUML（基本/未配置服务）、文件尾换行（无/多个）、异常输入（未闭合围栏/非法表格宽度）。

每个类别至少含正常（`boundary: 'normal'`）与边界（`boundary: 'edge'`）样例（task 1.1 验收）。

## 3. 允许规范化 → 命名测试映射

下表把 7 个登记的规范化（`CANONICALIZATIONS`，见 `editor.markdown.fingerprint.ts`）映射到各自的**命名行为测试**（`editor.markdown.canonicalization.test.ts`）与语料 fixture，说明每个规范化的确切引擎契约。

| 规范化名 | 契约类型 | 命名测试 | 对应 fixture |
|---|---|---|---|
| `link-href-escaping` | 序列化层：转义/未转义 href 解析到同一 fingerprint | `editor.markdown.canonicalization.test.ts › link-href-escaping: escaped parens/quotes …` | `link-escaped-target` |
| `table-column-padding` | 序列化层：列宽填充是纯格式化，padded/minimal 同 fingerprint | `editor.markdown.canonicalization.test.ts › table-column-padding …` | `table-basic`, `table-empty-escaped` |
| `table-pipe-escaping` | 序列化层：单元格中 `\|` ↔ 字面 `\|`（只有 `\|` 存活） | `editor.markdown.canonicalization.test.ts › table-pipe-escaping …` | `table-empty-escaped` |
| `file-tail-newline` | 文本层：`canonicalize()` 把 EOF 换行簇折叠为单个；解析器丢弃 EOF 空行 | `editor.fingerprint.test.ts › treats an EOF trailing blank line as an allowed difference`；`… canonicalization.test.ts › file-tail-newline …` | `trailing-none`, `trailing-multiple` |
| `soft-break-normalization` | 内容保留：段内裸 `\n` 作为字面字符保留（CommonMark soft break, `breaks:false`） | `… canonicalization.test.ts › soft-break-normalization …` | `break-soft` |
| `list-continuation-indent` | 解析相关：缩进按 1 空格/层归一化；不同缩进宽度**不是**语义等价 | `… canonicalization.test.ts › list-continuation-indent …` | `nested-list-continuation` |
| `code-trailing-newline` | 内容级：围栏代码内尾随 `\n` 是**真实内容**，被忠实保留（非格式化差异） | `… canonicalization.test.ts › code-trailing-newline …` | `code-trailing-lines`, `mermaid-empty` |

> 注意：契约类型区分了「序列化层等价」（两个仅在规范化上不同的源码指纹相同）与「内容/解析相关」（规范化命名的是引擎对某结构**忠实保留**的特定行为，不同输入宽度并非语义等价）。报告据此如实登记，不做过度宣称。

## 4. 无新增损失的证据

- **结构/文本/属性保真**：`tiptap-v3-spike.test.ts` 对 24 个 supported fixture 做 parse→serialize→reparse，断言规范化后的 JSON 结构一致（块类型、文本、authored 属性都保留）。
- **差分语料门禁**：`evidence/differential-corpus-summary.json` 记录每个 fixture 的 v2 结构签名与 v3 canonical 列表，`stage1-differential-gate.test.ts` 断言 gate=PASS（24 supported + 2 invalid，7 个命名规范化）。
- **已知 v2 差异登记**：fixture 的 `knownV2Differences` 字段记录了 v2 的行为（如链接转义、列表缩进归一化、代码尾随换行、EOF 换行），它们由规范化列表覆盖或作为既定基线。
- **真实文档只读扫描**（补充证据）：`evidence/field-scan-summary.json` 对 33 份真实文档做 v3 只读 round-trip，零未分类损失（阶段一 5.6 门禁）。

## 5. 结论

受支持语料在 v2→v3 迁移后**无新增文本/结构/属性损失**；所有 engine 输出差异均落在一个被命名的规范化集合内，且每个规范化都有对应的命名行为测试（§3）与门禁断言。异常输入分类正确、不可保存。

## 6. 复跑命令

```bash
# 语料 round-trip + 差分门禁
npx vitest run src/lib/tiptap-v3-spike.test.ts src/lib/stage1-differential-gate.test.ts

# 规范化命名测试（本报告 §3 的来源）
npx vitest run src/lib/editor.markdown.canonicalization.test.ts src/lib/editor.fingerprint.test.ts

# 完整回归
npm test
```
