# ChatGPT Desktop 26.803.61601 黑盒行为矩阵（tasks 1.10）

> 状态：**DRAFT — 观察协议已冻结；Observed 列待人工在桌面应用执行后填写**（P0）
>
> 对象版本：ChatGPT Desktop `26.803.61601`（用户指定；Powered by Codex & OWL）。
>
> **证据等级纪律（硬边界，来自 umbrella design.md）：**
> - 每条观察必须标注 `Observed`（本协议在指定版本上的可重复黑盒输入/步骤/输出）、
>   `Officially documented`（官方公开产品文档明确说明的用户能力）、或 `Inference`（推断）。
> - **无公开源码/技术文档时，禁止推断内部编辑器（CodeMirror/ProseMirror/contenteditable）
>   或 byte-to-byte 保存架构；`Inference` 不得进入 MarkFlow 的 MUST 合同。**
> - 本矩阵只作为交互启发，**不是**架构依据或采购/依赖依据。

## 1. 观察协议（冻结）

1. 记录环境：应用版本（`26.803.61601`）、OS/版本、WebView 内核版本（如可取）、是否登录、网络状态。
2. 每个输入使用**合成内容**（不含真实私人文档）：明确记录输入字符串、光标位置、操作步骤。
3. 每个操作单独成行：输入 → 操作 → 可观察结果 → 输出 artifact（截图/文本/导出结果路径）。
4. 无法取得**原始文件 bytes** 的保存/导出场景，不得宣称 ChatGPT 已证明 byte-to-byte 保存。
5. 重复三次确认可复现性；不可复现的结果标注 flaky。
6. 结果由人工验收人填写 `Observed` 列；AI 不代替点击。

## 2. 观察维度与占位表

| 维度 | 合成输入（建议） | 操作 | Observed（PENDING） | Officially documented | Inference |
| --- | --- | --- | --- | --- | --- |
| Selection | `# Title\n\n**bold** text\n\n- item` | 光标/方向键/Shift+Arrow 在 marker 边界移动 | 待人工观察 | — | 不推断 |
| Enter/Backspace | 列表/引用/代码围栏段落 | 在列表项、空行、围栏内 Enter/Backspace | 待人工观察 | — | 不推断 |
| Paste | 带链接/列表/图片的富文本与纯文本 | 粘贴到普通段落、代码上下文 | 待人工观察 | — | 不推断 |
| Undo/Redo | 连续输入 + 粘贴 | Ctrl/Cmd+Z / Y 多次 | 待人工观察 | — | 不推断 |
| Marker 显隐 | `#`、`**`、`` ` ``、`[text](url)` | 观察标记在光标进入/离开时是否切换显示 | 待人工观察 | — | 不推断 |
| Export/Save | 单段与多段文档 | 导出 Markdown/文本并检查可观察输出 | 待人工观察 | — | 无原始 bytes 前不宣称 byte 保真 |

> 说明：`Officially documented` 列在当前复核日留空。截至本设计复核日，
> OpenAI 公开发布的产品文档**没有**公开该桌面版 Markdown/文档编辑 surface 的
> 源码、依赖清单、正文模型、selection mapping、History 或保存协议
> （umbrella design.md 证据边界）。官方文档描述的 ChatGPT/Codex 产品能力
> （如「可编写/编辑代码」）不属于 MarkFlow 的 byte 合同证据。

## 3. 禁止事项

- 因界面观感相似就声称内部使用 CodeMirror/ProseMirror/contenteditable。
- 以「Codex 是执行者」或模型自述推断 OpenAI 私有实现。
- 把黑盒观察的相似性当作 MarkFlow 架构选型的 MUST 依据。
- 在没有可核验官方源码/技术文档时，把任何 Inference 写入 capability spec。

## 4. 后续处理

若未来出现可核验的官方源码/技术文档，再以同一协议补充 Observed/Official
列并更新本矩阵；在此之前，MarkFlow 技术选型只以当前代码、draft 代码证据、
CodeMirror/Rust 官方能力与固定 SHA 开源实现为依据。
