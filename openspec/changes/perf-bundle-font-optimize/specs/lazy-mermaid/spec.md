## ADDED Requirements

### Requirement: Mermaid 按需加载

Mermaid 图表渲染库 SHALL 采用动态 import 实现按需加载。启动时 MUST NOT 加载 Mermaid 主实现代码。仅当文档内容中出现 mermaid 代码块（fence）时，SHALL 在首次渲染时动态导入 Mermaid 库。

#### Scenario: 无 Mermaid 文档不加载

- **WHEN** 用户打开的文档中不包含 mermaid 代码块（` ```mermaid `）
- **THEN** Mermaid 库 SHALL NOT 被加载到内存中，主入口 JS bundle 中不包含 Mermaid 代码

#### Scenario: 首次渲染 Mermaid 时加载

- **WHEN** 用户打开的文档中包含 mermaid 代码块，且该文档首次进入编辑器视口
- **THEN** 系统 SHALL 动态 import Mermaid 库，完成加载后渲染所有 mermaid 代码块

#### Scenario: 后续文档复用缓存

- **WHEN** Mermaid 库已加载完成，用户切换到另一个包含 mermaid 代码块的文档
- **THEN** 系统 SHALL 直接使用已加载的 Mermaid 实例，不重复加载

### Requirement: Mermaid 渲染指示

Mermaid 库加载期间，SHALL 向用户展示加载状态指示（如 spinner 或占位文本），避免页面空白。

#### Scenario: 加载中显示占位

- **WHEN** Mermaid 库正在动态加载
- **THEN** mermaid 代码块位置 SHALL 显示加载中状态，而非空白或错误
