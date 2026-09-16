## MODIFIED Requirements

### Requirement: Mermaid 按需加载

惰性渲染管道 SHALL 支持多种图表类型（Mermaid、PlantUML、KaTeX）的按需加载。启动时 MUST NOT 加载任何图表渲染库。仅当文档内容中出现对应语法时，SHALL 在首次渲染时动态导入对应渲染库。

#### Scenario: 无 Mermaid 文档不加载

- **WHEN** 用户打开的文档中不包含 mermaid 代码块（` ```mermaid `），也不包含数学公式语法
- **THEN** Mermaid 库 SHALL NOT 被加载到内存中，主入口 JS bundle 中不包含 Mermaid 代码
- **THEN** 不含公式的文档中 KaTeX 库 SHALL NOT 被加载到内存中，主入口 JS bundle 中不包含 KaTeX 代码

#### Scenario: 首次渲染 Mermaid 时加载

- **WHEN** 用户打开的文档中包含 mermaid 代码块，且该文档首次进入编辑器视口
- **THEN** 系统 SHALL 动态 import Mermaid 库，完成加载后渲染所有 mermaid 代码块
- **WHEN** 用户打开的文档中包含数学公式语法，且该文档首次进入编辑器视口
- **THEN** 系统 SHALL 动态 import KaTeX 库，完成加载后渲染所有数学公式

#### Scenario: 后续文档复用缓存

- **WHEN** Mermaid 库已加载完成，用户切换到另一个包含 mermaid 代码块的文档
- **THEN** 系统 SHALL 直接使用已加载的 Mermaid 实例，不重复加载
- **WHEN** KaTeX 库已加载完成，用户切换到另一个包含数学公式的文档
- **THEN** 系统 SHALL 直接使用已加载的 KaTeX 实例，不重复加载
