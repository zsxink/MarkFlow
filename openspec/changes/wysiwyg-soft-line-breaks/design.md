# Design

## Context

见 proposal.md 的 Why。当前管线：`markflowMarked`（`src/editor/init.ts:60`，`breaks: false`）注入 `@tiptap/markdown`；软换行的 `\n` 整体留在 marked text token 内 → `parseInlineTokens`（包内，无 override 入口）原样建 text 节点 → `\n` 残留在 ProseMirror text 节点数据层，显示层被 CSS 空白折叠塌缩为空格。硬换行（`  \n`、`\\\n`）今天就已经走独立 `br` token → 上游 `HardBreak.parseMarkdown` → `hardBreak` 节点 → `renderMarkdown: () => '  \n'`。

实测（marked Lexer 探针）确认 token 形态：

| 源码拼写 | breaks:false | breaks:true | br token raw |
|---|---|---|---|
| `a\nb`（软） | text 内嵌 `\n` | text + br + text | `"\n"` |
| `a  \nb`（硬-两空格） | text + br + text | 同左 | `"  \n"` |
| `a\\\nb`（硬-反斜杠） | text + br + text | 同左 | `"\\\n"` |

`breaks: true` 只影响行内 token 化；块级结构、code span 内换行（实测 `` `a\nb` `` 保持 codespan 原文）、GFM 表格单元格（行级，无换行）均不受影响。

## Goals / Non-Goals

Goals：
- WYSIWYG 按行显示段落内软换行，数据层字节往返严格不变（不编辑即保存 → 字节相同）
- 软/硬换行在文档模型与序列化拼写上双向可区分、往返不互换
- 粘贴进入的多行纯文本显示语义与解析加载一致
- 所有既有旁路（admission、reconcile、单块升级、局部字面量、导出）行为一致

Non-Goals：
- 方案 B（用户可配置软换行语义设置项）——复用本实现做后续增强，本变更不做
- WYSIWYG 中软/硬换行的视觉区分（Typora 也不区分；两者都渲染 `<br>`）
- Setext `===` 下划线的续行转义（现状首行也不转义，遗留缺口，另行处理）
- CodeMirror 源码模式任何变更

## Decisions

### D1：复用 `hardBreak` 节点 + `soft` 属性，不新建节点类型

软换行表示为 `{ type: 'hardBreak', attrs: { soft: true } }`，通过扩展上游 `HardBreak` 实现（`markdownTokenName: 'br'`、parseMarkdown、renderMarkdown 均可 override）。

- 备选 1（否决）：自定义 `softBreak` 节点类型。需自行补齐 Enter/Backspace/选区/IME/撤销粒度等全部编辑交互（ProseMirror 对 hardBreak 有内建处理），需注册 `MARKFLOW_SERIALIZABLE_TYPES`，风险面即 issue 风险清单第 6 条。复用 hardBreak 后这些全部继承，`MARKFLOW_SERIALIZABLE_TYPES` 已含 `hardBreak` 无需改。
- 备选 2（否决）：只改 CSS（`white-space` 保留 LF 显示）。text 节点内嵌 `\n` 无法承载光标/选区/删除语义，用户仍无法编辑换行本身；且序列化转义逻辑仍按整段文本处理，续行前缀转义无法逐行定位。
- 属性默认 `null`（非 `false`）：`fingerprint.ts` 的 `isDefaultAttribute` 对 `null`/`undefined` 跳过（视为默认），`false` 不跳过——选 `null` 保证「无 soft 属性」在 setContent 物化与 manager.parse 省略两种表示下指纹一致。

### D2：`breaks: true` + 按 br token raw 全等判定软硬，而非解析后 JSON 后处理

- 决策：`markflowMarked` 与 `createMarkdownExtension` 的 `markedOptions` 都改 `breaks: true`；自定义 HardBreak 的 `parseMarkdown: (token) => token?.raw === '\n' ? { type: 'hardBreak', attrs: { soft: true } } : { type: 'hardBreak' }`。raw 严格全等 `\n` 才算软；`  \n`、`\\\n` 及任何其他形态一律硬。
- 备选（否决）：保持 `breaks: false`，在 `adapter.ts` 两个 parse 出口对结果 JSON 做后处理拆分 text 内 `\n`。只覆盖 adapter 出口，包内直接走 lexer 的路径（tokenizer helpers、后续版本可能的 paste 解析）拿不到；且需自行跳过 code mark 内的 `\n`（code span 换行必须保留字面量）。breaks:true 路线下 marked 保证 code span 不产生 br token（实测），判定天然正确。
- `renderMarkdown` override：`(node) => node?.attrs?.soft === true ? '\n' : '  \n'`。软换行输出裸 `\n`（严格无尾随空格），硬换行维持上游 `  \n`。
- `fallback.ts` 的独立 lexer（`breaks: false`，`fallback.ts:133`）**不改**：它只做块级边界识别（`parseLocalizedMarkdown` 的 token.raw 定位与 gap 计算），br 只出现在行内层，块级 token 序列在两个 breaks 取值下相同；受支持块经 `verifySingleBlockUpgrade` → `parseTipTapMarkdownToDoc` 走 manager lexer，自动获得软换行节点。加回归测试固化。
- `parseMarkdown` 返回 `attrs: undefined`（硬）而非 `{soft: null}`：省略 attrs 让 setContent/JSON 物化路径走 schema 默认值，与现有 `parseMarkdown: () => ({ type: 'hardBreak' })` 表示一致。

### D3：`escapeParagraphMarkdown` 逐行转义

实现从「取首行、转义、拼回」改为「按 `\n` 拆行、每行应用既有四条规则（数字列表 / `-`+`+` / ATX `#` / 整行 HR）、重新拼接」。规则本身不变（regex 复用），只改作用范围。

理由：软换行可见后用户在续行输入 `1. ` / `# ` / `- ` / `---` 开头文本的概率大增；两空格硬换行场景今天已存在同一缺口（`正文  \n1. x` 同样会被再解析为列表），逐行化一并修复。Setext `===` 维持现状（Non-Goal）。

### D4：粘贴规范化用 `transformPasted` 插件

包内无任何 markdown paste 解析（grep 确认），粘贴纯文本走 ProseMirror 默认路径，多行文本可能以 text 内嵌 `\n` 进入文档。数据层无损（序列化同字节），但显示塌缩、与解析路径不一致。加一个 ProseMirror plugin 的 `transformPasted`（与 `init.ts` 现有 imageSrcResolverPlugin 等同模式）：遍历 pasted slice，把非 code mark 的 text 节点内 `\n` 拆为 `hardBreak{soft:true}`。幂等：已拆分内容不含 `\n`，无操作。

### D5：序列化边界的 mark 处理接受既有语义

包内序列化器对 hardBreak 前关闭活动 marks、后不重开（`dist/index.js:1207` 特判）。`**a\nb**` 类「强调跨软换行」序列化可能拆分为 `**a**\n**b**` 形态——节点结构与语义指纹等价（mark 在 br 两侧本就是两个 text 运行），属 spec「允许的规范化」条款覆盖的语义等价规范化，但**必须**由测试证明无内容/属性丢失；若实测发现 mark 丢失（而非拆分），则升级为缺陷在本变更内修复。未编辑文档不会因此变 dirty：admission 与保存对账比较的都是同一序列化器的两次输出。

## Risks / Trade-offs

- [breaks:true 是全局开关，影响所有行内上下文] → 全量回归：round-trip 固定语料库 + §3.8 改写 + 新增 fixture（软换行在强调/链接/列表/引用内）；实测已覆盖 code span、表格不受影响；`verifyAdmission` 的再解析比较天然双侧行为一致。
- [序列化精度：软换行多输出一个尾随空格就会静默升级为硬换行] → `renderMarkdown` 严格返回 `'\n'`；§3.8 断言 output 不含 `  \n` 拼写；fixture 断言字节相等（`1 行\n2 行\n3 行` 不编辑即保存字节不变）。
- [指纹/对账不一致 → 假 dirty 或整篇降级（#391 模式）] → soft 为 authored 属性（非 runtime-only），所有 parse 路径产出的表示确定一致（同一 parseMarkdown handler）；null 默认值保证缺省表示指纹相同；补 admission/reconcile/单块升级回归测试。
- [编辑交互回归（光标跳位、删除吞换行）] → 复用 hardBreak 全部内建行为，无自定义节点；Shift+Enter/Mod-Enter 产生无 soft 属性的硬换行（序列化 `  \n`），与「用户显式插入硬换行」语义一致。补手工/E2E 冒烟。
- [导出行为变化：HTML/docx/PDF 中软换行从塌缩空格变为 `<br>` 换行] → 与「所见即所得」对齐，是本变更的目的之一；docx.ts 已处理 `br`；补导出回归。
- [测试 harness 遗漏 HardBreak 替换 → 软换行被当硬换行序列化] → 从 `extensions/index.ts` 导出新扩展；逐一检查使用 `createMarkdownExtension` 的测试构建点；`npm test` 全量把关。

## Migration Plan

纯前端单版本交付，无数据迁移：磁盘 markdown 不变，重新打开旧文档即获得新显示。回滚 = revert 提交；旧版本读取新版本保存的文档也安全（序列化字节与旧版一致——不编辑即保存字节不变）。

## Open Questions

无。
