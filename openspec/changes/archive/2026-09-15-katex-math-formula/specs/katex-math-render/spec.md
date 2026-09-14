## Purpose

定义 KaTeX 数学公式的按需加载、语法识别与渲染管道，支持行内 `$..$` 与块级 `$$..$$` 公式的实时渲染。

## ADDED Requirements

### Requirement: KaTeX 按需加载

KaTeX 渲染库 SHALL 采用动态 import 实现按需加载。启动时 MUST NOT 加载 KaTeX 主实现代码。仅当文档内容中出现数学公式语法时，SHALL 在首次渲染时动态导入 KaTeX 库。

#### Scenario: 无公式文档不加载

- **WHEN** 用户打开的文档中不包含 `$..$` 或 `$$..$$` 公式语法
- **THEN** KaTeX 库 SHALL NOT 被加载到内存中，主入口 JS bundle 中不包含 KaTeX 代码

#### Scenario: 首次渲染公式时加载

- **WHEN** 用户打开的文档中包含数学公式语法，且该文档首次进入编辑器视口
- **THEN** 系统 SHALL 动态 import KaTeX 库，完成加载后渲染所有数学公式

#### Scenario: 后续文档复用缓存

- **WHEN** KaTeX 库已加载完成，用户切换到另一个包含数学公式的文档
- **THEN** 系统 SHALL 直接使用已加载的 KaTeX 实例，不重复加载

### Requirement: 行内公式识别

系统 SHALL 识别行内数学公式语法 `$..$`，其中 `..` 为 LaTeX 数学表达式。

#### Scenario: 行内公式渲染

- **WHEN** 文档中出现 `$E=mc^2$` 行内公式语法
- **THEN** 系统 SHALL 将其渲染为行内数学公式块，显示渲染后的数学表达式

#### Scenario: 行内公式边界检测

- **WHEN** 文本中出现 `$` 字符但未形成有效的行内公式（如 `$100` 或 `$` 单独出现）
- **THEN** 系统 SHALL 将其视为普通文本，不触发公式渲染

### Requirement: 块级公式识别

系统 SHALL 识别块级数学公式语法 `$$..$$`，其中 `..` 为 LaTeX 数学表达式。

#### Scenario: 块级公式渲染

- **WHEN** 文档中出现 `$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$` 块级公式语法
- **THEN** 系统 SHALL 将其渲染为居中的块级数学公式块，显示渲染后的数学表达式

#### Scenario: 块级公式跨行

- **WHEN** 块级公式语法跨越多行（如 `$$\n\frac{a}{b}\n$$`）
- **THEN** 系统 SHALL 正确识别并渲染完整的多行公式

### Requirement: 公式编辑交互

用户 SHALL 能够通过双击公式块进入源码编辑模式。

#### Scenario: 双击编辑公式

- **WHEN** 用户双击已渲染的公式块
- **THEN** 系统 SHALL 切换到源码编辑模式，显示对应的 LaTeX 语法（如 `$E=mc^2$` 或 `$$...$$`）

#### Scenario: 编辑后重新渲染

- **WHEN** 用户在源码编辑模式修改公式内容后确认
- **THEN** 系统 SHALL 重新渲染修改后的公式，显示更新后的数学表达式

### Requirement: 公式渲染指示

KaTeX 库加载期间，SHALL 向用户展示加载状态指示（如 spinner 或占位文本），避免页面空白。

#### Scenario: 加载中显示占位

- **WHEN** KaTeX 库正在动态加载
- **THEN** 公式语法位置 SHALL 显示加载中状态，而非空白或错误

### Requirement: 公式错误处理

系统 SHALL 处理无效的 LaTeX 语法，提供友好的错误提示。

#### Scenario: 无效 LaTeX 语法

- **WHEN** 用户输入无效的 LaTeX 语法（如 `$\invalid$`）
- **THEN** 系统 SHALL 显示错误提示（如"公式语法错误"），而非空白或崩溃
