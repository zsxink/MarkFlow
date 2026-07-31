# R3C：FrontMatter、Diagram 与 HTML

## 目标

完成高风险结构化模型、异步渲染和 raw content 安全策略。

## 范围

- OpenSpec tasks：`8.9-8.12`；`8.12` 由本阶段汇总全部 widget accessibility evidence。
- 主要区域：Core FrontMatter/diagram descriptors、Host/network sandbox、widget UI、安全策略。

## 实现

1. FrontMatter safe typed form，支持受控 nested fields 与 scalar types。
2. field command 只局部 patch，保留 comments、quotes、order、indent、EOL。
3. alias/tag/duplicate/malformed 等 unsafe YAML 显示 diagnostics 和 source submode。
4. Mermaid/PlantUML 支持 sandbox、timeout、cancel、stale drop、refresh、copy/export、reveal。
5. HTML comment fold/reveal；raw HTML 按 A6 保持 inert 或 sandbox。
6. 异步 widget 预留稳定尺寸，large document lazy render。
7. 汇总 R3A-R3C keyboard-only 与 accessibility evidence。

## 验收

- safe FrontMatter 局部编辑 lossless；unsafe model 不结构化重写。
- diagram result 严格匹配 identity，超时/切文档/编辑后 stale drop。
- script、event handler、unsafe URL 不执行。
- 所有 P0 widgets 完成 keyboard/focus/source fallback。
- 人工执行 `M-R3-09` 至 `M-R3-12`。

## 回滚

FrontMatter、Diagram、HTML 独立回退 exact source；network/sandbox failure 默认 fail closed。

## 前后依赖

- 前置：[R3B](./r3b-table-image-widgets.md)
- 后续：[R4A](./r4a-input-integrity.md)、[R4B](./r4b-performance-security.md)

