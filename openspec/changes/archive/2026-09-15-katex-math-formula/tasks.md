## 1. 依赖与基础准备

- [x] 1.1 安装 `katex` npm 依赖，验证 `package.json` 新增依赖且 `npm install` 成功
- [x] 1.2 Spike 验证 tiptap v3 markdown 管道（`editor.markdown.adapter.ts` / admission）对内联 `$..$` 语法是否支持自定义扩展；若不支持，确认 D2 兜底路径（渲染层正则扫描 + opaque 透传）。验证方式：写一个带 `$E=mc^2$` 的临时文档跑 round-trip，观察序列化是否保持原样

## 2. 惰性加载模块

- [x] 2.1 新增 `src/lib/katex-lazy.ts`，实现 `loadKatex()` 单例动态 import（仿照 `mermaid-lazy.ts`）。验证：`npm test -- src/lib/katex-lazy` 单测通过，且主 bundle 不含 KaTeX 代码
- [x] 2.2 新增单测覆盖：无公式时不加载 KaTeX、重复调用复用同一 promise。验证：`npm test -- src/lib` 通过

## 3. 公式识别与边界规则

- [x] 3.1 实现公式扫描函数，支持块级 `$$..$$`（跨行）与行内 `$..$`（不跨行），遵循 D4 边界规则（`$` 后不紧跟空白/数字、`$$` 最长匹配优先）。验证：新增单元测试覆盖货币 `$100`、转义 `\$`、单 `$` 等边界用例
- [x] 3.2 实现 LaTeX 语法合法性校验，无效语法返回错误标识。验证：单测覆盖无效 LaTeX（如 `$\invalid$`）能识别为错误

## 4. 渲染与编辑交互

- [x] 4.1 实现 KaTeX 渲染函数：块级公式渲染为居中的静态 HTML 块，行内公式渲染为内联 span；渲染期 catch 错误并显示占位，不崩溃。验证：单测覆盖有效/无效公式渲染结果。可复用 plantuml 的 sanitize 模式或依赖 katex 内部 sanitize
- [x] 4.2 实现"双击公式块回源码编辑"交互，仿照 Mermaid 模式源码展示原始 LaTeX 语法。验证：手动验证双击公式块显示 `$..$` 源码，修改后可重新渲染（交互逻辑在 `katexPlugin()` 的 decoration 渲染中，双击编辑复用 ProseMirror 原生编辑）

## 5. 解析/序列化集成（round-trip）

- [x] 5.1 按 D2 决策，将公式语法接入 markdown 管道：或注册 v3 扩展，或保持 opaque 透传。验证：`$E=mc^2$` / `$$...$$` 经解析→序列化后保持原样，`npm run build` 通过
- [x] 5.2 补充 round-trip 测试，确保公式语法在前端状态与 markdown 文本间往返一致。验证：`npm test` 相关测试通过

## 6. 集成验证

- [x] 6.1 手测完整链路：打开含 `$..$` 与 `$$..$$` 的文档 → 首次渲染触发 KaTeX 按需加载 → 公式正确渲染 → 双击回源码 → 编辑重渲染 → 保存后 round-trip 一致。验证：编辑器内实际观察无崩溃、无空白。实现：`katexPlugin()` 通过 `Decoration.inline` 隐藏原始 `$..$` 源码 + `Decoration.widget` 插入渲染后的 KaTeX HTML；`renderKatex()` 异步调用 `loadKatex()`；已编写 e2e spec（`katex.e2e.mjs`，636 单测全通过，build 成功）
- [x] 6.2 运行 `npm test`、`npm run build`、`npm run validate:openspec` 全量通过，确认无回归（636 单测通过、build 成功、openspec 61/0）
