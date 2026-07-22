# empty-line-preservation Specification

## Purpose
定义源码模式下用户输入空行的保留规则，确保保存和模式切换不会因图片归一化逻辑而静默删除用户明确输入的空行。

## Agent Context
- **源码入口：** `src/lib/editor.serializer.ts`（`normalizeImageMarkdown`、`fixImageNewlines`）
- **关联规范：** `enter-content-integrity`、`codemirror-source-editor`、`block-continuation-paragraph`
- **不变量：** 用户输入的连续 2 个及以上的空行在保存后保持不变；图片前后至多保留一个空行。
- **验证：** `npm test -- src/lib/editor.serializer.test.ts`；`npx openspec validate empty-line-preservation --strict`。

## Requirements

### Requirement: 图片归一化不压缩无关空行

`normalizeImageMarkdown()` 中用于保障图片块级分隔的逻辑 SHALL NOT 压缩非图片附近的连续空行。仅限图片节点相邻行做必要空行整理，全文其余位置的空行忠实保留。

#### Scenario: 源码模式多空行保存后保留
- **WHEN** 用户在源码模式输入如下内容：
  ```
  第 1 行

  第 2 行（前面有三个空行）


  第 3 行
  ```
- **AND** 用户保存文档并重新打开
- **THEN** 第 1 行和第 2 行之间的三个空行被保留
- **THEN** 第 2 行和第 3 行之间的两个空行被保留

#### Scenario: 图片附近空行仍然保持正确分隔
- **WHEN** Markdown 中包含独立图片行
- **THEN** 图片前后各恰好有一个空行，确保图片作为块级元素正确渲染
- **THEN** 非图片区域的空行不受此规则影响

#### Scenario: 代码围栏内空行不受影响
- **WHEN** Markdown 中包含围栏代码块（\`\`\`）
- **THEN** 代码块内部的连续空行保持原样
- **THEN** 代码块外部的连续空行也被保留（只要不在图片附近）

#### Scenario: 没有图片时全文空行全部保留
- **WHEN** Markdown 中没有任何图片引用
- **THEN** `normalizeImageMarkdown()` 返回与输入完全相同的 Markdown（除回车归一化外）
