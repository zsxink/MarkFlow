# katex-math-render Specification

## Purpose
定义 KaTeX 数学公式的按需加载、语法识别与渲染管道，支持行内 `$..$` 与块级 `$$..$$` 公式的实时渲染。

## Requirements

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

系统 SHALL 识别块级数学公式语法 `$$..$$`，其中 `..` 为 LaTeX 数学表达式。行首（允许至多 3 个空格缩进）的 `$$` 开启块级公式识别，内容允许跨行，直到最近出现的 `$$` 闭合；识别结果 SHALL 表示为独立的块级公式节点，LaTeX 内容 MUST NOT 经过 Markdown 行内解析或序列化转义（反斜杠、`&`、换行等字符原样保留）。代码围栏内的 `$$` MUST NOT 被识别为公式；未闭合的 `$$` MUST 走普通文本解析。

#### Scenario: 块级公式渲染

- **WHEN** 文档中出现 `$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$` 块级公式语法
- **THEN** 系统 SHALL 将其渲染为居中的块级数学公式块，显示渲染后的数学表达式

#### Scenario: 块级公式跨行

- **WHEN** 块级公式语法跨越多行（如 `$$\n\frac{a}{b}\n$$`）
- **THEN** 系统 SHALL 正确识别并渲染完整的多行公式

#### Scenario: 行首跨行块级公式作为独立块节点

- **WHEN** 文档包含 `$$\n\begin{align}\n  a &= b + c \\\n  d &= e + f\n\end{align}\n$$`（`$$` 位于行首、内容跨行、含 LaTeX 换行符 `\\` 与对齐符 `&`）
- **THEN** 系统 SHALL 解析为独立块级公式节点，`latex` 内容与源码中两个 `$$` 定界符之间的内容一致（`\\`、`&`、缩进、换行原样保留）
- **THEN** 系统 SHALL 渲染该节点为 KaTeX 块级公式，不显示原始 `$$` 文本行

#### Scenario: 行中与行内公式不受影响

- **WHEN** `$$..$$` 出现在行中间（如 `文本 $$a+b$$ 尾部`）或 `$..$` 行内公式出现在段落中
- **THEN** 系统 SHALL 保持既有装饰渲染行为，不受块级公式节点化影响

#### Scenario: 代码围栏内的双美元符不识别

- **WHEN** 围栏代码块（如 ```` ``` ```` 包裹）的内容中出现 `$$` 行
- **THEN** 系统 SHALL 将其保留为代码内容，不产生块级公式节点

#### Scenario: 未闭合的双美元符走普通文本

- **WHEN** 文档包含行首 `$$` 但其后没有闭合 `$$`（如 `$$\nx\ny`）
- **THEN** 系统 SHALL 按普通文本段落解析，不产生块级公式节点

### Requirement: 公式编辑交互

用户 SHALL 能够通过双击公式块进入源码编辑模式。块级公式节点 SHALL 支持点击进入源码编辑（textarea），确认后更新公式内容并重新渲染。

#### Scenario: 双击编辑公式

- **WHEN** 用户双击已渲染的公式块
- **THEN** 系统 SHALL 切换到源码编辑模式，显示对应的 LaTeX 语法（如 `$E=mc^2$` 或 `$$...$$`）

#### Scenario: 编辑后重新渲染

- **WHEN** 用户在源码编辑模式修改公式内容后确认
- **THEN** 系统 SHALL 重新渲染修改后的公式，显示更新后的数学表达式

#### Scenario: 块级公式节点内编辑

- **WHEN** 用户点击跨行块级公式节点进入源码编辑，修改 LaTeX 内容后确认
- **THEN** 节点 `latex` 内容按编辑结果更新并重新渲染，序列化输出按更新后的内容生成
- **WHEN** 用户取消编辑
- **THEN** 节点内容保持不变

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