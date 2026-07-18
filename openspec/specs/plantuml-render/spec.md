## Purpose

提供安全、按需的 PlantUML 图表渲染能力。

## Requirements

### Requirement: PlantUML 服务器设置
系统 SHALL 提供一个名为“PlantUML 服务器地址”的可持久化设置，默认值 MUST 为空字符串。设置界面 MUST 明确说明：使用外部 PlantUML 服务器会将该图表文本发送给第三方，存在隐私与数据外泄风险；敏感内容 SHALL 建议使用自建服务器。

#### Scenario: 默认设置不渲染
- **WHEN** 用户未配置 PlantUML 服务器地址
- **THEN** 系统 SHALL 保持设置值为空，并且不为 PlantUML 代码块发起任何网络请求

#### Scenario: 用户保存自建服务器地址
- **WHEN** 用户输入并保存有效的自建 PlantUML 服务器地址
- **THEN** 系统 SHALL 持久化该地址，并将其用于后续 PlantUML 图表请求

### Requirement: 按需加载与渲染
系统 SHALL 仅在文档出现 `plantuml` 代码块且已配置服务器地址时，动态加载 PlantUML 渲染实现。实现 MUST 缓存首次加载结果，以供后续文档复用，且主入口 bundle MUST NOT 包含该渲染实现。

#### Scenario: 无 PlantUML 文档不加载
- **WHEN** 用户打开的文档不含 `plantuml` 代码块
- **THEN** 系统 SHALL NOT 加载 PlantUML 渲染实现

#### Scenario: 首次渲染显示加载状态
- **WHEN** 已配置服务器地址的 PlantUML 代码块首次进入编辑器视口
- **THEN** 系统 SHALL 显示加载中占位，并在动态加载完成后请求和显示图表

#### Scenario: 后续文档复用加载结果
- **WHEN** PlantUML 渲染实现已加载且用户切换到另一篇含 PlantUML 代码块的文档
- **THEN** 系统 SHALL 复用已加载的实现而不重复动态导入

### Requirement: 无服务器时的安全回退
当 PlantUML 服务器地址为空、无效或渲染请求失败时，系统 SHALL 保留原始 PlantUML 源码的普通代码块展示；渲染输出 MUST 经 SVG 清理后才能插入 DOM。

#### Scenario: 空服务器地址回退为代码块
- **WHEN** 文档包含 PlantUML 代码块且服务器地址为空
- **THEN** 系统 SHALL 显示普通代码块，且不创建任何 PlantUML 网络请求

#### Scenario: 渲染失败安全回退
- **WHEN** PlantUML 服务器返回错误、超时或无效 SVG
- **THEN** 系统 SHALL 显示错误提示和原始代码，且不得将未清理的响应内容注入 DOM
