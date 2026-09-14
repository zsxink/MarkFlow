# Tasks: GFM 表格 WYSIWYG 交互增强

## 1. 表格输入规则（D1）

- [x] 1.1 在 `MarkdownSafeTable` 增加 `addInputRules()`：实现匹配「表头行 + 分隔行（列数一致）+ 可选数据行 + 回车」的 InputRule，命中后以 `insertTable` 替换为表格节点并把光标置于首个数据单元格。验证：新增单测覆盖合法/非法表格输入，非法输入保持原文本不转换
- [x] 1.2 用项目既有语料补足误触发防护：普通含 `|` 段落、列数不一致的分隔行均不得转成表格。验证：`editor.eligibility.test.ts` 的 malformed-table 用例对齐扩展通过

## 2. 单元格右键菜单（D3）

- [x] 2.1 新增 `src/components/tableContextMenu.ts`：用 `showContextMenuStatic` 提供 上行/下行/左列/右列/删行/删列/删表 + 对齐 + 表头行切换。验证：单测断言菜单项集合与作用域解析（触发单元格所在行列）
- [x] 2.2 在表格编辑插件中加 `props.handleDOMEvents.contextmenu`：命中 `td/th` 时 `preventDefault + stopPropagation` 并弹表格菜单，与 `imageBubblePlugin` 模式一致。验证：手动右键单元格出现表格菜单、普通文本右键不出现
- [x] 2.3 对齐命令接入：对触发列全部单元格 `setCellAttribute('align', …)`，序列化后为 `:--- / :---: / ---:` 对齐标记。验证：单测断言设置对齐后源码含正确对齐标记

## 3. 悬停工具条（D2）

- [x] 3.1 自绘 `TableView`（table node `View` 选项）：包裹 `.table-toolbar-host` 容器，内嵌悬停工具条（上/下行、左/右列、删行、删列）。验证：光标进入表格工具条出现，移出隐藏，无 DOM 残留
- [x] 3.2 工具条尺寸/遮挡处理：固定置于表上方、`z-index` 高于 `.ProseMirror`、随表格 boundingRect 刷新。验证：`npm run tauri dev` 手工确认不遮挡单元格、位置随滚动正确
- [x] 3.3 工具条结构化操作接入既有 chainable 命令（`addRowAfter`/`deleteColumn` 等），编辑后经既有 seriali 管道写回。验证：增删行列后切源码模式，Markdown 结构正确、其他行/列内容不变

## 4. 往返保真回归

- [x] 4.1 扩展 `wysiwyg-markdown-round-trip.section3.test.ts`：新增对齐设置往返、交互增删行列往返、表头切换往返用例。验证：全部通过
- [x] 4.2 交互编辑后文档走既有 admission/reconcile 安全管道，无法安全往返时降级源码。验证：构造无法往返的表格编辑，断言降级语义生效

## 5. 样式与整合

- [x] 5.1 `src/styles/editor.css` 增加表格悬停工具条、表格选中态（CellSelection）视觉样式，遵循 css-layout 规则（flex-grow、hidden 显式 display:none）。验证：light/dark/sepia 三主题下工具条与表格清晰可辨
- [x] 5.2 全量回归：`npm test` + `npm run build` + `npm run validate:openspec` 通过；手工验证 KaTeX/Mermaid 等既有功能未受影响

## 6. 收尾

- [x] 6.1 刷新 `docs/next-phase-roadmap.md` 1.2 表格增强状态与 `.claude/memory` 表格相关踩坑记录。验证：文档反映已交付能力
- [x] 6.2 归档变更：`openspec archive table-wysiwyg-interaction` 并同步 specs。验证：archive 成功、`openspec validate` 通过