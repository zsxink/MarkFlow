# 前端包体积基线（历史快照）

> **状态：历史基线（已过期）**
>
> - **记录日期**：2026-07-19。本文是一次性的历史测量记录，**不是当前断言基线**，其中的任何数字都不应被当作当前阈值或验收标准。
> - **重新生成**：`npm run analyze`，报告写入 `docs/bundle-report.html`（该文件已在 `.gitignore` 中，不纳入版本库）。需要当前数字时请重新运行该命令，不要引用本文。
> - **权威体积门禁**：`openspec/specs/bundle-budget/spec.md`（行为契约）+ `npm run check-size`（可执行检查）。当前预算为主入口 JS **500KB gzip**、中文字体合计 **4MB**；超限构建失败。
> - **归档去向**：本文件随清理方案一并转为历史记录（方案原目录已迁移至 `docs/archive/cleanup-plan/`），未完成事项见跟踪 issue #337。

以下内容保留 2026-07-19 当时的原始记录，仅用于与后续构建（如 PR #331 的 chunk 拆分）做历史对照。

> 构建工具：Vite 5.x
> 总 dist/ 体积：8.7 MB（72 个文件）

## 总体分布

| 类别 | 大小 |
|------|------|
| JS 文件合计 | 4.8 MB |
| 字体文件合计 | 3.8 MB |
| CSS | 28 kB |
| HTML | 10.55 kB |

## Top 3 最大 JS Chunk

| Chunk | 原始大小 | Gzip 大小 | 内容描述 |
|-------|---------|----------|---------|
| `mermaid.core-*.js` | 627.13 kB | 151.36 kB | Mermaid 核心渲染引擎（lazy load） |
| `wardley-*.js` | 616.24 kB | 148.86 kB | Mermaid Wardley 图扩展（lazy load） |
| `index-*.js` | 551.50 kB | 186.36 kB | 主应用入口（ProseMirror + CodeMirror + Tiptap + UI） |

### 说明

- 前两个 chunk 为 Mermaid 相关，已通过 lazy load 从主 chunk 中分离
- 主入口 chunk 包含 ProseMirror 编辑器、CodeMirror 源码模式、Tiptap 扩展及核心 UI 组件
- Vite 对超过 500 kB 的 chunk 会输出警告

## 字体文件

| 字体 | 大小 |
|------|------|
| SourceHanSerifSC-Bold | 1,903.70 kB |
| SourceHanSerifSC-Regular | 1,814.15 kB |
| SourceSerif4-Bold | 81.54 kB |
| SourceSerif4-Regular | 76.26 kB |
| SourceSerif4-BoldIt | 63.46 kB |
| SourceSerif4SmText-It | 61.67 kB |

中文字体合计约 3.7 MB，在 4MB 预算范围内。

## 已知动态导入冲突

以下模块被动态导入但也被静态导入，可能导致重复打包（记录于 2026-07-19，未复核）：

1. `@codemirror/lang-css` — 动态导入 vs `@codemirror/lang-html` 静态导入
2. `@codemirror/lang-javascript` — 动态导入 vs `@codemirror/lang-html` 静态导入
3. `@codemirror/lang-html` — 动态导入 vs `@codemirror/lang-markdown` 静态导入
4. `plantuml-lazy.ts` — 动态导入 vs `editor.extensions.ts` 静态导入
5. `editor.ts` — 动态导入 vs 多个模块静态导入

## 与当前产物对照（撰写本文档收尾说明时的一次性测量）

> **该对照为一次性测量**：数据取自撰写本次文档收尾说明时（2026-10-21）本机 `dist/assets` 的一次构建产物，**仅为说明上面的历史数字已经过期，不是持续维护的断言，也不构成阈值**。需要最新数字请运行 `npm run analyze`。

| Chunk | 该次一次性测量 | 历史记录（2026-07-19） |
|-------|---------------|----------------------|
| `mermaid.core` | 687K | 627.13 kB（`mermaid.core-*.js`） |
| `cynefin` | 675K | 无（2026-07-19 时尚未拆分出来） |
| `vendor-prosemirror` | 512K | 无（2026-07-19 时并入主入口） |
| `index` | 463K | 551.50 kB（`index-*.js`） |

同一次一次性测量时，`vite.config.ts:26` 的 `chunkSizeWarningLimit` 为 `720`（单位 kB）——它是 Vite 的告警阈值，**不是体积预算**；真正的预算与失败条件见 `openspec/specs/bundle-budget/spec.md` 与 `npm run check-size`。
