# 开源编辑器行为矩阵（tasks 1.9）

> 状态：**FROZEN**（P0，2026-08-12）
>
> 固定源码快照（仅作交互设计证据，不是依赖/移植基线）：
> - MarkText/Muya：`e52106f`（https://github.com/marktext/marktext/tree/e52106fd1cdcbd33c1258b7b0cdc7013c4c5d86c/packages/muya/src）
> - Vditor：`a1302b0`（https://github.com/Vanessa219/vditor/tree/a1302b04941569e55fb22be9fe4ac801a891b808/src/ts）
>
> 矩阵按「可借鉴机制 / 禁止移植机制」冻结进本变更的 ADR（docs/adr.md），
> 详细源码证据见 umbrella `design.md` §开源实现调研。**两者的正文模型
> （Muya contenteditable DOM+Block Tree；Vditor 三套 contenteditable DOM+Lute
> 转换器）都不是 byte-preserving source editor，不作为 MarkFlow 正文真相。**

## 1. Block closure（结构闭包失效）

| 维度 | Muya 证据 | Vditor 证据 | 可借鉴（MarkFlow） | 禁止移植 |
| --- | --- | --- | --- | --- |
| Block 拆分/更新边界 | `block/base/treeNode.ts`、`parent.ts`、`content.ts`；`format.ts::enterHandler` | `wysiwyg/input.ts`、`ir/input.ts` 找当前 block，列表提升到顶层并纳入脚注/引用定义 | 局部解析边界必须包含影响语义的关联结构（最小结构闭包） | 整块 DOM 重建 / `outerHTML` 送 parser 替换 block |
| 列表/引用/脚注闭包 | `paragraphContent/index.ts` 处理 list/quote/fence/table 上下文 | 列表提升 + 脚注引用定义纳入重绘闭包 | Enter/Backspace 先识别结构上下文 | 不把 UI block mutation 作为正文真相 |

## 2. Marker reveal（源码标记显隐）

| 维度 | Muya 证据 | Vditor 证据 | 可借鉴 | 禁止移植 |
| --- | --- | --- | --- | --- |
| 显隐判定 | `inlineRenderer/lexer.ts` 产生带 source range 的 token；按 cursor/token range 选 `MU_GRAY`/`MU_HIDE` | IR/SV 保留 marker DOM；`ir/expandMarker.ts` 展开活动 marker；`showCode.ts` 编辑时切回源码 | marker 是否隐藏由 source range 与 selection/composition 相交关系决定 | 整块 `innerHTML` 重写、DOM class 隐藏、DOM offset 当 source offset |
| 投影原则 | — | source/preview siblings | 「非活动时投影、活动时显示可编辑源码」是 Live Preview 正确交互原则 | source sibling + preview sibling 两份可编辑内容；decoration/widget 只是同一 CM doc 的投影 |

## 3. Selection

| 维度 | Muya 证据 | Vditor 证据 | 可借鉴 | 禁止移植 |
| --- | --- | --- | --- | --- |
| 映射 | `selection/TextSelection.ts` 在 DOM Range ↔ block path+offset+direction | `util/selection.ts` 重绘前插 `<wbr>`，重绘后恢复原生 Range | selection 可序列化、可经 transform 映射、带 direction/affinity | 持久化 DOM node/block object reference |
| 恢复 | `offsetCursor.ts` 用 sentinel 注入/parse/serialize 定位 | 按 `textContent.length` 扫描 position fallback | recovery 路径可验证 cursor 映射，不静默跳文首 | sentinel 两次 parse/serialize；DOM 字符计数当 source 坐标；`wbr`/ZWSP 进正文或 History |

## 4. Enter / Backspace

| 维度 | Muya 证据 | Vditor 证据 | 可借鉴 | 禁止移植 |
| --- | --- | --- | --- | --- |
| 结构命令 | `format.ts::enterHandler` 拆分文本 | `processKeydown.ts`（wysiwyg/ir/sv）+ `fixBrowserBehavior.ts` 对 list/table/quote/code/task/HR 逐类处理 | Enter/Backspace 是一组按 context 决策、可单测的结构命令 | 浏览器特例堆；CodeMirror command 应输出确定的 source `ChangeSpec` |

## 5. Paste

| 维度 | Muya 证据 | Vditor 证据 | 可借鉴 | 禁止移植 |
| --- | --- | --- | --- | --- |
| 分类 | `clipboard/paste.ts` 冻结 clipboard/selection，区分 code/table literal、HTML、Markdown、图片 | `fixBrowserBehavior.ts` 拦截默认 paste，区分 HTML/plain/file/code，sanitize 后转换 | MIME/context 分类、先删除 selection、一次 transaction、literal context、结构 seam | HTML→Markdown→JSON state 非无损；paste 触发全文 parse/serialize；`execCommand`/DOM 插入 |

## 6. Undo / Redo

| 维度 | Muya 证据 | Vditor 证据 | 可借鉴 | 禁止移植 |
| --- | --- | --- | --- | --- |
| History | `history/index.ts` 对 JSON op 求逆，按 input kind 打断/合并 | `undo/index.ts` 三模式分别保存 `innerHTML` 的 diff-match-patch 栈 | History entry 携带 selection before/after；paste/Enter/结构命令/bulk replace 有明确 group boundary | UI block JSON op；固定 1 秒计时合并；DOM-string History 对 renderer 变化敏感、模式间分裂、整根替换 |

## 7. 反例（不可照搬的导入/导出）

- Muya `state/markdownToState.ts` / `stateToMarkdown.ts`：重造 ATX marker、trim HTML、合并文本、重新 escape table —— 语义一致但无法保证「编辑正文后未触及字节不变」。
- Vditor `toolbar/EditMode.ts` + `getMarkdown()` + `Md2Vditor*DOM`/`SpinVditorSVDOM` 全量生成 DOM：模式切换就是一次有损全文 round-trip。

## 8. 结论（冻结）

MarkFlow 不复刻 contenteditable WYSIWYG，只吸收其成熟交互感受：
1. Block/CST 只提供结构和 source ranges，不拥有第二份正文。
2. Inline marker 只由 Decoration 投影（先弱化，后按 cohort 隐藏）。
3. Selection 以 CodeMirror UTF-16 positions 为交互基准，bridge 显式转 UTF-8/source byte。
4. Enter/Backspace 是 command matrix，不是 DOM 修复。
5. Paste 是有类型的一次 transaction。
6. Undo/Redo 只有 CodeMirror History。
7. Projection 局部更新按结构闭包失效，不可信时扩大 source fallback。

这些结论已写入 child change ADR（docs/adr.md 末节）与 umbrella design.md，后续实现不得回退到 DOM round-trip 正文模型。
