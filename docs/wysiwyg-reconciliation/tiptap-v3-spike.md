# TipTap v3 降风险 Spike 记录

日期：2026-08-31  
依赖：`@tiptap/core`、`@tiptap/markdown`、相关官方扩展 `3.30.5`；Vitest 2.1.9；`happy-dom`

## 结论

方案 B 的第一阶段可以继续落地到“官方 Markdown 扩展 + Source 安全回退”的降风险范围。基础 spike 与 app-like corpus 测试均可运行，证明 v3 的 `Markdown` 扩展可以驱动编辑器 Markdown parse/render，并且可以注入独立 `Marked` 实例。资格门禁、opaque token 和 reconcile 仍属于阶段二，不在本次 spike 的实施授权内。

完整 B 方案暂不应直接启用。项目当前已开始迁移 `CustomLink` 与 Mermaid/PlantUML code block 到 v3 handler，但 app-like corpus 暴露出 escaped table pipe 的 round-trip 缺陷；其余自定义扩展仍需继续补齐边界验证后，才能宣布完整 B 方案通过。

## Spike 覆盖范围

测试文件：`src/lib/tiptap-v3-spike.test.ts`

machine-readable 结果由测试导出：`TIPTAP_V3_CORPUS_RESULTS`。当前 corpus 为 26 个 fixture：23 个 supported 样本中 22 个 round-trip 通过，`table-empty-escaped` 为已知 FAIL；2 个 invalid 样本均被分类且不崩溃。

| 能力 | 结果 | 观察 |
| --- | --- | --- |
| 注入自定义 `Marked` 实例 | PASS | `editor.markdown.instance` 与注入实例相同 |
| 自定义 block tokenizer | PASS | `Marked.use({ extensions: [...] })` tokenizer 能识别并 render 自定义 token |
| soft break | PASS | `one\\ntwo` 保持为软换行 |
| hard break | PASS | `two spaces + newline` 保持为 `  \\n` |
| list continuation | PASS（语义） | 列表续行结构保留；官方 renderer 会补两个尾部空行 |
| task list | PASS（语义） | `[x]` / `[ ]` 状态保留；官方 renderer 会补两个尾部空行 |
| GFM table | PASS（语义） | 普通表格结构和单元格值保留；renderer 会规范化列宽、前导换行及尾部空行 |
| 官方 Link/Image/CodeBlock parse/render | PASS | 链接、图片属性、`mermaid` fenced code 均可 parse 并 render |
| 当前 app `CustomLink` round-trip | PASS | escaped target fixture 的 href/title 属性及 Markdown 输出保持；自定义 v3 handler 已生效 |
| code block node view 基础兼容 | PASS | 自定义 CodeBlock 派生 node view 可挂载，Markdown parse 不受影响 |
| Mermaid/PlantUML 类型 | PASS（基础） | `language` 属性可保留并重新输出 fenced code；实际 SVG/PlantUML 网络渲染不在此 spike 范围 |
| StarterKit 重复扩展 | PASS（门禁） | 重复注册会告警并最终因重复 keyed plugin 抛错；必须避免再次加入 StarterKit 已包含的扩展 |

## 已知限制与完整 B 的前置条件

1. `CustomLink` / `BlockImage` 继承官方 Link/Image；当前 `CustomLink` 的 v3 parse/render 在 corpus 中通过，图片仍需补充资产 URL 替换及更多边界样本。
2. 当前 Mermaid/PlantUML 扩展是 `CodeBlockLowlight` 的派生扩展。node view 本身能注册，语言属性能 round-trip；旧的 storage serializer/parser hook 不能作为 v3 兼容证据。需要使用 `renderMarkdown` / `parseMarkdown`，并增加 Mermaid、PlantUML、未知语言及尾换行 corpus。
3. v3 renderer 的输出不是字节级 Markdown round-trip：列表和 task list 会补尾部空行，table 会调整列宽并补前导/尾部空行。验收必须比较规范化 AST/语义，不能直接比较原字符串。
4. 直接将两个完整 `StarterKit` 实例传给 Editor 会出现大量 duplicate extension warning，并在 keyed plugin 注册时抛错。迁移时应使用一个 StarterKit，并通过 `StarterKit.configure({ ...: false })` 排除需要自定义实现的扩展。
5. `table-empty-escaped` 当前为 FAIL：输入中的 escaped pipe（`a \\| b`）经过 app-like Table serializer/parser 后被拆成两个 cell，说明完整 B 仍需修复 escaped-pipe 的 canonicalization 或 table tokenizer 边界。

## 如何判定可以进入完整 B

降风险版上线后，至少满足以下门禁再扩展：

- 现有固定 corpus 在 parse → JSON → render 后的规范化 AST/Markdown 比较全部通过；
- `table-empty-escaped` 的已知 FAIL 已修复，且 escaped pipe 有独立回归测试；
- `CustomLink`、`BlockImage`、Mermaid、PlantUML 的 v3 `parseMarkdown` / `renderMarkdown` handler 已迁移，并有正向、边界、未知语言测试；
- 资产 URL 替换、代码块尾换行和转换失败的 Source 安全回退在 editor bridge 层验证通过；
- `npm test`、`npx tsc --noEmit` 和构建均通过；
- 任一 v3 handler 失败时，阶段一安全回退能把文档留在源码模式，不覆盖最后一次安全源码。

只有上述条件同时满足，才建议打开完整 B 的默认路径；否则继续使用降风险版并记录失败 fixture。
