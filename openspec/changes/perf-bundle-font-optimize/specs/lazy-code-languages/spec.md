## ADDED Requirements

### Requirement: CodeMirror 语言按需加载

CodeMirror 语言支持 SHALL 按 fence 类型动态加载。启动时 MUST NOT 注册全部语言实现。仅当文档中出现对应语言的代码块时，SHALL 在首次使用时动态 import 该语言的 CodeMirror 扩展。

#### Scenario: 启动时最小语言集

- **WHEN** 应用启动
- **THEN** 仅 SHALL 注册基础语言支持（如 markdown、javascript），其他语言扩展 MUST NOT 包含在主入口 bundle 中

#### Scenario: 首次使用语言时加载

- **WHEN** 用户文档中出现新的语言 fence（如 ` ```python `），且该语言扩展尚未加载
- **THEN** 系统 SHALL 动态 import 对应的 CodeMirror 语言扩展，加载完成后高亮该代码块

#### Scenario: 已加载语言复用

- **WHEN** 某语言扩展已加载完成，用户在同一文档或其他文档中再次使用该语言 fence
- **THEN** 系统 SHALL 直接使用已加载的语言扩展，不重复加载

### Requirement: 语言加载失败回退

语言扩展动态加载失败时，SHALL 回退到纯文本渲染，不阻断编辑器使用。

#### Scenario: 离线或网络异常

- **WHEN** 语言扩展动态 import 失败（如网络异常、文件缺失）
- **THEN** 对应代码块 SHALL 以纯文本方式渲染，编辑器其他功能 SHALL NOT 受影响
