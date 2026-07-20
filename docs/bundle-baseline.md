# 前端包体积基线

> 记录日期：2026-07-19
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

以下模块被动态导入但也被静态导入，可能导致重复打包：

1. `@codemirror/lang-css` — 动态导入 vs `@codemirror/lang-html` 静态导入
2. `@codemirror/lang-javascript` — 动态导入 vs `@codemirror/lang-html` 静态导入
3. `@codemirror/lang-html` — 动态导入 vs `@codemirror/lang-markdown` 静态导入
4. `plantuml-lazy.ts` — 动态导入 vs `editor.extensions.ts` 静态导入
5. `editor.ts` — 动态导入 vs 多个模块静态导入
