# ADR: Typora 式结构编辑与表格键盘矩阵

- 状态：**ACCEPTED FOR IMPLEMENTATION**
- 适用阶段：P4B interaction substrate、P6 基础构造、P7 GFM table
- 依赖：[Typora 投影与交互 ADR](./adr-typora-projection-interaction-contract.md)

## 1. 决定目标

冻结 heading、list、quote 与 GFM table 的唯一键盘语义，避免实现阶段在“拆分或创建”“退出或降级”等分支中自行选择。所有行为以 Markdown source position 为输入，输出只能是一个 `TransactionSpec`、`RevealSource` 或 `NoOp`；成功的一个用户意图对应一个 History group，并显式给出 `selectionAfter`。

通用规则：对 heading/list/quote/fence 等 source command，非空 selection 先在同一 transaction 中删除，再以 collapse 后位置执行下表。Table widget 的 selection/composition 规则是显式例外并优先于本通用规则。Composition 未结束、read-only、malformed 或 range 不可信时不做结构转换，保持/reveal source。所有新增 line boundary 继承当前位置 EOL；未触及 marker style、缩进、空行和 EOL bytes 保持不变。

## 2. Heading

`contentStart` 指 heading marker 与其后空格之后，`contentEnd` 指行内容末尾。

| 操作与位置 | 唯一 source transaction | `selectionAfter` |
| --- | --- | --- |
| Enter，非空 heading 的 `contentStart` | 在 heading 前插入一个空 paragraph line；原 heading 完整下移 | 新空 paragraph 行首 |
| Enter，非空 heading 内容中部 | prefix 保持原 heading；在当前 source pos 拆分，suffix 成为下一行普通 paragraph，不复制 heading marker | 新 paragraph 行首 |
| Enter，非空 heading 的 `contentEnd` | 在下一行插入空 paragraph，不复制 heading marker | 新 paragraph 行首 |
| Enter，空/marker-only heading | 删除该行 heading marker 与分隔空格，使当前行成为空 paragraph | 当前行首 |
| Backspace，caret 在 `contentStart` | 删除当前 heading marker 与其分隔空格，使整行成为 paragraph | 原内容行首 |
| Backspace，其他位置 | 普通 source delete | 删除后的 source pos |
| Delete，selection 覆盖完整 heading | 只删除 selection；不得合并或重写相邻 block marker | selection 起点 |

## 3. Ordered/Unordered/Task List

新同级 item 继承当前 item 的 marker family、indent 与 task 形态；ordered list 只为新增 item 计算当前 literal number 的下一值，不重编号 surviving items。

| 操作与状态 | 唯一 source transaction | `selectionAfter` |
| --- | --- | --- |
| Enter，非空 item 内容中部 | 在 caret 拆分内容，suffix 进入新同级 item；插入继承的 marker/indent/task unchecked marker | 新 item 内容开头 |
| Enter，非空 item 内容末尾 | 新建空同级 item，继承 marker/indent；task item 新项为 unchecked | 新 item 内容开头 |
| Enter，空 item，嵌套深度 > 1 | 仅 outdent 一级，保留 item marker family | outdent 后内容开头 |
| Enter，空 item，顶层 | 删除该 item marker/indent/task marker，退出为当前空 paragraph | 当前 paragraph 行首 |
| Backspace，caret 在内容开头且嵌套深度 > 1 | outdent 一级 | outdent 后内容开头 |
| Backspace，caret 在内容开头且为顶层 | 删除 list/task marker 与结构空格，转换为 paragraph | 原内容行首 |
| Backspace，其他位置 | 普通 source delete；不得隐式重编号 | 删除后的 source pos |
| Tab，存在可成为 parent 的前一同级 item | indent 一级 | 原内容的映射位置 |
| Tab，无合法前一同级 item | `NoOp`，保持/reveal source | 不变 |
| Shift-Tab，嵌套 item | outdent 一级 | 原内容的映射位置 |
| Shift-Tab，顶层 item | `NoOp` | 不变 |

## 4. Blockquote

每次退级只移除一层 quote marker。嵌套 quote 的其余层、列表 marker 和正文保持原样。

| 操作与状态 | 唯一 source transaction | `selectionAfter` |
| --- | --- | --- |
| Enter，非空 quote 的 contentStart | 在当前 quote line 前插入同 quote depth 的空 quote line；原行完整下移 | 新空 quote 内容开头 |
| Enter，非空 quote 内容中部 | 在 caret 拆分，prefix 留在当前 quote line，suffix 进入下一条同 depth quote line | 新 quote 内容开头 |
| Enter，非空 quote 内容末尾 | 追加一条同 depth 的空 quote line | 新 quote 内容开头 |
| Enter，空 quote line | 删除一层 quote marker；若已是最后一层则成为空 paragraph | 退级后内容开头 |
| Backspace，caret 在 quote 内容开头 | 删除一层 quote marker 与其结构空格 | 退级后内容开头 |
| Backspace，其他位置 | 普通 source delete | 删除后的 source pos |

## 5. GFM Table Cell Navigation

仅对拥有可信 delimiter、row、cell content ranges 的 table widget 生效；escaped pipe、多行 cell、嵌套 HTML、malformed delimiter 或任一 range 不可信时，整个最小 table range `RevealSource`，不得部分启用矩阵。

| 操作与状态 | 唯一行为 | `selectionAfter` / focus |
| --- | --- | --- |
| Click cell | 进入该 cell 的 source-backed editor slot | 点击对应的 cell content source pos |
| ArrowLeft/Right，caret 未到 content 边界 | 普通文本移动 | 前/后一 source pos |
| ArrowLeft，在 contentStart | 移到前一 cell contentEnd；首 cell 则保持 | 前一 cell 末尾或不变 |
| ArrowRight，在 contentEnd | 移到后一 cell contentStart；末 cell 则保持 | 后一 cell 开头或不变 |
| ArrowUp/Down，collapsed selection | 移到同列上一/下一 data row，按 source column clamp；越界保持 | 目标 cell 对应位置或不变 |
| Tab | 移到下一 cell；最后一个 data cell 时追加一行 | 下一 cell 开头；新行首 cell 开头 |
| Shift-Tab | 移到前一 cell；第一个 cell 时 `NoOp` | 前一 cell 开头或不变 |
| Enter | commit 当前 cell 并移到同列下一 data row；最后一行时追加一行 | 下一行同列 cell 开头 |
| Escape | commit 当前 cell、关闭 cell edit，焦点回 table widget；再次 Escape 执行 `RevealSource` | table widget 或 table source start |
| Home/End | 移到当前 cell contentStart/contentEnd | cell 首/尾 |
| composition active | Enter/Arrow/Tab 交给 CodeMirror/IME 完成 composition，不跨 cell、不追加行；compositionend 后下一次按键才执行导航 | CodeMirror 映射位置 |
| 非空 selection，Enter | 不删除 selection、不插入换行；commit 当前 cell 后按普通 Enter 规则移到同列下一 data row，末行则追加一行 | 下一行同列 cell 开头 |
| 非空 selection，Arrow | 使用 CodeMirror selection collapse/extend 语义，不跨 cell | cell 内映射位置 |
| 非空 selection，Tab/Shift-Tab | 不删除 selection；commit 后按普通 Tab/Shift-Tab 导航 | 相邻 cell 开头或矩阵规定的边界结果 |

新增行只插入一条与现有列数一致的 source row，继承 delimiter 风格和当前 EOL，不重排旧行。Alignment、row/column add/delete/move 不是隐式导航副作用，必须由显式 UI 命令发起并声明全部 affected ranges。

## 6. Paragraph、Fence、Atomic 与跨块 selection

| 操作与上下文 | 唯一行为/source transaction | `selectionAfter` / focus |
| --- | --- | --- |
| Paragraph，Enter | 在 caret 插入一个继承当前位置 EOL 的 logical line boundary | 新行开头 |
| Paragraph，Backspace at line start | 只删除与前一行之间的一个 logical line boundary并合并文本 | 原边界位置 |
| Fence body，Enter | 在 fence content 内插入 literal line boundary；不得关闭、重开或规范化 fence | 新 body 行对应缩进位置 |
| Fence body，Backspace/Delete | 执行普通 source delete；跨 body 行时只删除一个 line boundary，不触发 fence 结构转换 | CodeMirror 映射位置 |
| Caret 位于 opening/closing fence marker | `RevealSource`；随后按普通 source 文本处理，结构语义不拦截本次按键 | 对应 source pos |
| Arrow 跨 hidden-marker 或 atomic construct/widget | 使用 `atomicRanges` 从 range 前边界一次移动到后边界，反向亦然；不得落在隐藏内部 | range 前/后边界 |
| Backspace 紧邻 closing hidden-marker 后边界 | reveal owning construct；删除 contentRange 末尾一个 grapheme，paired marker 保持完整；content 为空则 `NoOp` | 删除后的 contentEnd，或 revealed 空 content |
| Delete 紧邻 opening hidden-marker 前边界 | reveal owning construct；删除 contentRange 开头一个 grapheme，paired marker 保持完整；content 为空则 `NoOp` | 原 contentStart |
| Backspace 紧邻 opening marker 后边界，或 Delete 紧邻 closing marker 前边界 | reveal owning construct，`NoOp`；不得单独删除 delimiter | 对应 revealed source boundary |
| Backspace/Delete 紧邻 atomic construct/widget | 仅当 descriptor 声明 `deletePolicy=whole` 时以一次 transaction 删除完整 construct source range；否则 `RevealSource` 且不改 doc | range 起点，或 revealed source boundary |
| Enter 位于 atomic boundary | 文本 caret 先 `RevealSource` 且不改 doc；widget focus 仅在 descriptor 明确声明 Enter activation 时激活，commit 另形成一次 transaction | source boundary 或 widget focus |
| 非空跨块 selection，Enter | 以一个继承 selection 起点 EOL 的 line boundary替换完整 source selection | 插入边界之后 |
| 非空跨块 selection，Backspace/Delete | 删除完整 source selection，不执行第二个上下文命令 | selection 起点 |
| Malformed/unknown，Enter | 先保持/reveal source，再插入一个继承 EOL 的普通 line boundary | 新行开头 |
| Malformed/unknown，Backspace/Delete | 保持/reveal source，执行 CodeMirror 普通 source deletion | CodeMirror 映射位置 |

跨块与 atomic 命令必须读取 CodeMirror source selection；不得从 rendered DOM 选择范围反算。若 selection 只覆盖 atomic range 的一部分，先 reveal source，再按普通 source selection 处理，不得悄悄扩大删除范围。Strong/emphasis/link marker boundary 与 image/widget `deletePolicy=whole` 必须分别有表驱动测试。

## 7. Fallback、Undo 与验收

- 任一结构命令只能生成一次可 Undo transaction/History group；Undo 恢复原 source 与原 selection。
- Widget command 必须先校验 binding/session/document/revision/source ranges；stale 时取消并 reveal 当前 source。
- 任何无法唯一决定的上下文都选择 `RevealSource` 或 `NoOp`，不得调用 Markdown serializer 猜测重写。
- 自动化表驱动测试必须逐行覆盖本 ADR，并记录 source before/after、affected ranges、`selectionAfter`、History group 与 surviving-span bytes。
- P6/P7 的人工体验可以建议调整，但改变本矩阵必须先更新 ADR、spec、tests 与支持矩阵，不能在代码中形成隐式例外。
