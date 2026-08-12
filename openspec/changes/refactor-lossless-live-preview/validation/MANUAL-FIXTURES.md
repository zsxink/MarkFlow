# 人工 Markdown 测试文档目录

## 1. 边界

`/Users/xian/markflow-test` 是人工在 MarkFlow 中打开的外部测试目录，只允许放平铺的 `.md` 文档；不得放 spec、任务、验证报告、日志、截图、图片子目录或其他资产。项目可重复的 canonical fixtures 仍必须放在 child change 的项目测试目录中，不能依赖这里的可变文件。

每次人工验收从下表选择文档，开始前记录文件 SHA-256、长度、BOM 和尾部 line-break boundary 数量。人工原件只读使用；需要保存时先复制到隔离 workspace。

## 2. 当前文档映射

| 文件 | 人工关注点 | 特殊字节预期 |
| --- | --- | --- |
| `01-trailing-two-blank-lines.md` | 正文编辑后保留两个视觉空白行 | 结尾三个 LF boundaries；报告不得写成“两个尾部换行” |
| `02-basic-live-preview.md` | heading、段落、strong/emphasis、link、quote、list、fence 基础投影 | 运行时记录 hash |
| `03-selection-and-ime.md` | CJK/emoji、正反向 selection、IME composition | 运行时记录 hash |
| `04-enter-backspace-structures.md` | heading/list/quote/fence/table 的 Enter/Backspace | 运行时记录 hash |
| `05-paste-targets.md` | plain/Markdown/HTML/code paste 目标上下文 | paste payload 另记 MIME/EOL provenance |
| `06-tasks-images-tables.md` | task、image、GFM table 与 source fallback | 不依赖外部图片子目录 |
| `07-references-footnotes.md` | reference/footnote 定义与依赖闭包 | 运行时记录 hash |
| `08-malformed-source-fallback.md` | 损坏/未知语法精确源码降级 | 打开与保存不得修复/规范化原文 |
| `09-diagrams-and-raw-html.md` | Mermaid/PlantUML/raw HTML 安全 fallback | 不发起未授权网络或脚本执行 |
| `10-empty-lines-around-content.md` | 文中连续空行与内容周围空行 | 记录每处 boundary 数量 |
| `11-crlf-trailing-blank-lines.md` | CRLF 与两个视觉空白行 | 结尾三个 CRLF boundaries |
| `12-utf8-bom.md` | UTF-8 BOM 打开、编辑、保存 | 开头 `EF BB BF`；未触及 BOM 必须保留 |

## 3. 人工 Run 必记字段

- 文档文件名、SHA-256、byte length；
- 是否有 UTF-8 BOM；
- EOL 类型和尾部 line-break boundary 数；
- 复制后的隔离 workspace 路径；
- 操作前后 hash/byte diff；
- 实际视觉空白行数；
- commit、flags、OS/WebView/IME；
- 人工结论和 issue 链接。

表中预期只用于人工选材，不替代项目内 canonical golden 与自动化 L0/L1 判定器。
