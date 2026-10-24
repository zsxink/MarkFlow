# Proposal

## Why

#404（PR #416）让段落内软换行可见、`escapeParagraphMarkdown` 改为逐行转义后，续行的四类块级前缀（有序/无序列表标记、ATX 标题、整行 HR）已被覆盖。但 CommonMark 中还有更多**能中断段落懒延续**的行首前缀未被转义，含此类续行的段落在「WYSIWYG 编辑 → 保存重解析」时不一致（issue #421）：

| 续行前缀 | 重解析结果 |
|---|---|
| `> 引用`（含 `>foo` 无空格形态） | 拆为 paragraph + blockquote |
| 围栏开头 ` ``` ` / `~~~` | 拆为 paragraph + fenced code block，围栏吞掉后续所有行 |
| `===`（Setext H1 下划线整行） | 上一行升级为 H1 标题（`---` 已被 HR 规则覆盖，`===` 没有） |
| `<div>`、`<!--` 等 HTML 块起始形态 | 拆为 html-block（opaque 路径） |

后果：保存时 reconcile 的 re-parse 语义指纹与编辑器模型不一致 → 保存被拒（安全失败、不写盘），表现为文档编辑后无法保存、dirty 无法清除；对未走 reconcile 的路径重新打开后段落被拆块。两空格硬换行续行同样存在——#404 之前就有的老缺口。磁盘上已有的此类源码（如 `正文\n> 引用`）打开时按 CommonMark 正确拆块显示，不是 bug，不受影响。

## What Changes

- `escapeParagraphMarkdown`（`src/editor/extensions/paragraph.ts`）在既有四条逐行规则不动的前提下新增四条逐行规则：
  - `^>` → `\>`（含 `>foo` 无空格形态；首行也应用——paragraph 行首 `>` 只可能来自被转义形态 `\>`，补回转义保真）
  - `^(`` {3,}|~{3,})` 围栏开头 → 转义首字符（首行也应用，同理保真转义形态）
  - `^={1,}\s*$` Setext `===` 整行 → 转义为 `\=`；**仅对非首行应用**——Setext 语义只在「该行是段落非首行」时构成标题下划线，首行 `===` 是普通文本，转义会造成无谓拼写改写
  - `^<[a-zA-Z!/]` HTML 块起始形态（CommonMark type 1-6 才能中断段落）→ 转义为 `\<`（首行也应用）
- **实测修正（实施期确认）**：`@tiptap/markdown` 的文本编码器在 `escapeParagraphMarkdown` 之前已把 `>`/`<` 编码为 `&gt;`/`&lt;`、反引号/波浪线逐字符转义，因此块引用/围栏/HTML 三类续行在当前管线**原本就不拆块**——真实唯一的拆块/保存冲突缺口是 Setext `===` 续行（re-parse 升级 H1 → reconcile conflict）。四条新规则仍全部落地：`===` 是实际修复，其余三条是函数级契约的纵深防御（段落层不依赖上游编码细节），并以测试 pin 住
- 转义/编码后行首字符不再是原生块前缀：eligibility 的 opaque/html-block 识别与 marked 解析都走普通段落路径（issue 明确要求「转义后必须仍走普通段落而非 opaque 识别」）
- 测试：`escapeParagraphMarkdown` 单测矩阵扩充（`src/editor/extensions/__tests__/index.test.ts`）、round-trip 续行四类前缀用例（按实测拼写 pin）、admission/reconcile 保存不冲突用例

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `paragraph-block-prefix-escape`: 续行被转义块级前缀的覆盖范围从四类（列表/标题/HR）扩展到块引用、围栏、Setext `===` 下划线、HTML 块起始形态

## Impact

- `src/editor/extensions/paragraph.ts`：`escapeLineLeadingPrefix` 增加四条规则与首行判定参数
- 测试扩充：`src/editor/extensions/__tests__/index.test.ts`、`src/__tests__/wysiwyg-markdown-roundtrip.section3.test.ts`、admission/reconcile 相关
- 无新增节点/解析器/设置变更；无 Rust 变更
- Non-Goals：paragraph 内 inline code mark 内容含 3+ 连续反引号且位于行首的极端用例（code span 定界符与围栏正则重叠，误转义会被 admission 指纹拦截为安全失败，不静默损坏）；`<?php` 等处理指令形态不在本次覆盖（issue 修复方向明确为 `[a-zA-Z!/]`）
