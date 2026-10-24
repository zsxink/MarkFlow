# Proposal

## Why

源码模式下输入无空行分隔的多行文本（段落内软换行，行尾无两空格）后切换到 WYSIWYG，所有行被合并显示为一行：`\n` 保留在 ProseMirror text 节点数据层（round-trip 实测无损），但 HTML 空白折叠把 LF 按一个空格渲染，显示与源码不一致（issue #404）。用户无法分辨视觉「空格」是空格还是换行，也无法在 WYSIWYG 中辨识或维护软换行；一旦删掉那个视觉「空格」，软换行被永久替换为真正的空格。同类编辑器（Typora、Obsidian 默认配置）均按换行显示段落内软换行。

## What Changes

- 解析层：软换行（text token 内单个 `\n`）解析为带 `soft` 属性的 `hardBreak` 节点（复用上游 HardBreak 扩展，`breaks: true` 发标准 `br` token，按 token raw 区分软硬：`\n` 为软，`  \n` / `\\\n` 为硬）
- 显示层：软换行节点渲染 `<br>`，WYSIWYG 中段落内多行文本按换行显示，与源码一致
- 序列化层：软换行节点精确输出裸 `\n`（不带尾随空格），硬换行维持 `  \n`；数据字节往返不变
- 转义层：`escapeParagraphMarkdown` 从仅转义首行改为逐行转义块级前缀（软换行可见后，续行以 `1. ` / `# ` / `- ` 开头的概率大增，仅转义首行会成为 round-trip 无损证明的漏洞）
- 粘贴层：粘贴进入的多行纯文本经同样的软换行规范化（`transformPasted`），显示语义一致
- 测试层：改写 §3.8「软换行不产生节点」断言为「软换行产生带 soft 属性的 hardBreak 且序列化回裸 `\n`」；扩充 break 类 fixture 与回归用例

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `wysiwyg-markdown-round-trip`: 换行语义的双向契约细化——软换行在 WYSIWYG 中以换行显示（`<br>`）、以独立节点表示，序列化精确还原为裸 `\n`，不得静默升级为硬换行
- `paragraph-block-prefix-escape`: 块级前缀转义从仅段落首行扩展到段落内每一行（软换行引入多行段落后，续行的块级前缀同样需要补转义）

## Impact

- `src/editor/init.ts`：`markflowMarked` 与 `markedOptions` 的 `breaks` 改为 `true`；StarterKit 禁用默认 hardBreak 并注册自定义扩展
- `src/editor/extensions/`：新增 soft-aware HardBreak 扩展；`paragraph.ts` 逐行转义；粘贴规范化插件
- `src/editor/markdown/`：adapter 白名单已含 `hardBreak` 无需改；single-block-upgrade / admission / reconcile 自动经统一 parse 路径获得一致行为；fallback.ts 独立 lexer 仅做块级扫描不受影响（需核对性测试）
- `src/__tests__/wysiwyg-markdown-roundtrip.section3.test.ts` §3.8 及相关 fixture、round-trip 测试 harness
- 导出管线（HTML/docx/PDF）经 `<br>` 自动继承换行显示（docx.ts 已处理 `br`，需回归确认）
- 无 Rust / 设置项变更（方案 B 的用户设置不在本次范围）
