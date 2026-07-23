# settings-code-highlight Specification

## Purpose
定义代码高亮设置（`codeHighlight`）在 WYSIWYG 和源码模式下的实际控制行为，确保开关真正影响围栏代码块的语法高亮渲染，并移除僵尸设置项。

## Agent Context
- **源码入口：** `src/lib/editor.init.ts`、`src/lib/editor.source.ts`、`src/lib/codemirror-highlight-limit.ts`、`src/components/settings.ts`
- **关联规范：** `codemirror-source-editor`、`lazy-code-languages`
- **不变量：** 关闭代码高亮时，围栏代码块仍保留代码块样式，仅隐藏语法着色；切换无需重新加载编辑器
- **验证：** `npm test -- src/lib`；手动验证 WYSIWYG 和源码模式

## Requirements

### Requirement: 代码高亮开关真实生效

`codeHighlight` 设置项 SHALL 实际控制 WYSIWYG 模式下围栏代码块的语法高亮渲染，以及源码模式下 CodeMirror 的语法着色行为。

#### Scenario: WYSIWYG 模式关闭高亮
- **WHEN** `codeHighlight` 设置为 `false`
- **THEN** WYSIWYG 模式下围栏代码块保留代码块背景色和等宽字体
- **AND** 代码块内部所有文本以单色（monochrome）显示，无 token 级语法着色
- **AND** 代码块整体结构和行号（如果启用）保持不变

#### Scenario: WYSIWYG 模式开启高亮
- **WHEN** `codeHighlight` 设置为 `true`
- **THEN** WYSIWYG 模式下围栏代码块显示完整的 token 级语法着色
- **AND** 语言标签（如 ```` ```typescript````）正确匹配对应语法

#### Scenario: 源码模式关闭高亮
- **WHEN** `codeHighlight` 设置为 `false`
- **THEN** 源码模式（CodeMirror）中代码块语法高亮关闭
- **AND** CodeMirror 编辑器变为纯色文本，语法着色 extension 禁用

#### Scenario: 源码模式开启高亮
- **WHEN** `codeHighlight` 设置为 `true`
- **THEN** 源码模式（CodeMirror）中显示完整语法高亮
- **AND** 高亮语言配置遵循 `lazy-code-languages` 规范

#### Scenario: 切换即时生效
- **WHEN** 用户在设置面板切换 `codeHighlight` 开关
- **THEN** 两种编辑模式（如果当前打开）立即响应
- **AND** 无需重新加载编辑器或文档

### Requirement: applyCodeBlockSettings 响应式调用

系统 SHALL 在设置变更时通过 `applyCodeBlockSettings()` 函数统一应用代码块相关设置（包含代码高亮、代码块行号、代码块自动换行）。

#### Scenario: 设置变更触发应用
- **WHEN** `settings:changed` 事件分发
- **THEN** `applyCodeBlockSettings()` 被调用
- **AND** 同时应用 `codeHighlight`、`codeLineNumbers`、`codeWordWrap` 设置
