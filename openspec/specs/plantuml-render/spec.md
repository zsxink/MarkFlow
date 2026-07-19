# plantuml-render Specification

## Purpose
定义 PlantUML 服务器设置、按需渲染及无服务器或渲染失败时的安全回退。

## Agent Context
- **源码入口：** `src/lib/plantuml.ts`、`src/components/settings.ts` 与 `src/lib/editor.ts`。
- **关联规范：** `safe-http-fetch`、`bundle-budget`、`error-handling`。
- **不变量：** 未配置服务器时绝不发起网络请求；请求仅发送当前图表源码；失败时保留可读源内容并展示可恢复状态。
- **验证：** `npm test -- src/lib`；`npm run build`；`npx openspec validate plantuml-render --strict`。

## Requirements

### Requirement: PlantUML 服务器设置
系统 SHALL 提供一个名为"PlantUML 服务器地址"的可持久化设置，默认值 MUST 为空字符串。设置界面 MUST 明确说明：使用外部 PlantUML 服务器会将该图表文本发送给第三方，存在隐私与数据外泄风险；敏感内容 SHALL 建议使用自建服务器。

#### Scenario: 默认设置不渲染
- **WHEN** 用户未配置 PlantUML 服务器地址
- **THEN** 系统 SHALL 保持设置值为空，并且不为 PlantUML 代码块发起任何网络请求

#### Scenario: 用户保存自建服务器地址
- **WHEN** 用户输入并保存有效的自建 PlantUML 服务器地址
- **THEN** 系统 SHALL 持久化该地址，并将其用于后续 PlantUML 图表请求

### Requirement: 按需加载、渲染与缓存
系统 SHALL 仅在文档出现 `plantuml` 代码块且已配置服务器地址时，动态加载 PlantUML 渲染实现。实现 MUST 缓存渲染结果（以 `serverUrl + source` 为 key），主入口 bundle MUST NOT 包含该渲染实现。渲染请求 MUST 通过 `@tauri-apps/plugin-http` 发出以绕过 webview CSP。

#### Scenario: 无 PlantUML 文档不加载
- **WHEN** 用户打开的文档不含 `plantuml` 代码块
- **THEN** 系统 SHALL NOT 加载 PlantUML 渲染实现

#### Scenario: 首次渲染显示加载状态
- **WHEN** 已配置服务器地址的 PlantUML 代码块首次进入编辑器视口
- **THEN** 系统 SHALL 显示加载中占位，并在动态加载完成后请求和显示图表

#### Scenario: 后续文档复用加载结果
- **WHEN** PlantUML 渲染实现已加载且用户切换到另一篇含 PlantUML 代码块的文档
- **THEN** 系统 SHALL 复用已加载的实现而不重复动态导入

#### Scenario: 渲染结果缓存复用
- **WHEN** 同一 `serverUrl + source` 组合的图表已成功渲染
- **THEN** 系统 SHALL 直接返回缓存的 SVG 而不发起新的网络请求

#### Scenario: 服务器地址或源码变更时缓存失效
- **WHEN** 用户更改了 PlantUML 服务器地址或修改了图表源码
- **THEN** 系统 SHALL 对新组合发起新请求，旧缓存条目不影响新渲染

### Requirement: PlantUML HTTP 客户端可重复解析

项目 SHALL 锁定并安装 `@tauri-apps/plugin-http`，使 PlantUML 渲染模块、其测试和前端构建能够解析该客户端依赖。

#### Scenario: 干净安装后的前端质量验证
- **WHEN** 从锁定依赖安装项目并执行 `npm test` 与 `npm run build`
- **THEN** PlantUML 渲染模块应解析 `@tauri-apps/plugin-http`
- **THEN** 命令不得因该模块缺失而失败

### Requirement: 无服务器或空源码时的安全回退
当 PlantUML 服务器地址为空、无效或渲染请求失败时，系统 SHALL 保留原始 PlantUML 源码的普通代码块展示；渲染输出 MUST 经 SVG 清理后才能插入 DOM。空源码（仅含空白或 `@startuml/@enduml` 标记）MUST 不发起网络请求，直接回退为代码块。

#### Scenario: 空服务器地址回退为代码块
- **WHEN** 文档包含 PlantUML 代码块且服务器地址为空
- **THEN** 系统 SHALL 显示普通代码块，且不创建任何 PlantUML 网络请求

#### Scenario: 空源码回退为代码块
- **WHEN** PlantUML 代码块内容仅含空白或 `@startuml/@enduml` 标记
- **THEN** 系统 SHALL 显示普通代码块，且不发起网络请求

#### Scenario: 渲染失败安全回退
- **WHEN** PlantUML 服务器返回错误、超时或无效 SVG
- **THEN** 系统 SHALL 显示错误提示和原始代码，且不得将未清理的响应内容注入 DOM

### Requirement: SVG 清理完善
渲染输出的 SVG MUST 经过清理以移除潜在的安全风险元素。清理 MUST 移除 `<style>` 元素（PlantUML SVG 通常使用呈现属性，移除风险低）。清理 MUST 仅剥离含外部 `url()` 引用的 `style` 属性声明，保留其余安全的内联样式（如 `stroke-dasharray`、字体、填充等）。清理 MUST 对所有外部请求添加 `referrerPolicy: 'no-referrer'`。

#### Scenario: 移除 style 元素
- **WHEN** PlantUML 返回的 SVG 包含 `<style>` 元素
- **THEN** 系统 SHALL 在插入 DOM 前移除所有 `<style>` 元素

#### Scenario: 保留安全内联样式
- **WHEN** SVG 元素的 `style` 属性包含安全声明（如 `stroke-dasharray: 5`）
- **THEN** 系统 SHALL 保留这些安全样式声明

#### Scenario: 剥离含外部 url 的样式
- **WHEN** SVG 元素的 `style` 属性包含 `url(https://evil.com/...)` 引用
- **THEN** 系统 SHALL 仅移除该 `url()` 声明，保留同属性中的其他安全声明

#### Scenario: 无来源信息的外部请求
- **WHEN** 系统发起 PlantUML 渲染请求
- **THEN** 请求 MUST 携带 `referrerPolicy: 'no-referrer'` 头部

### Requirement: 设置切换时 NodeView 重建
当设置变更导致 `isDiagram()` 状态翻转（如 `plantUmlServerUrl` 从空变为非空或反向）时，系统 SHALL 触发 ProseMirror NodeView 重建，而非仅调用内部 `render()` 方法。这确保 `contentDOM` 绑定正确重建，避免编辑映射错乱。

#### Scenario: 服务器地址从空变为非空
- **WHEN** 用户首次配置 PlantUML 服务器地址（从空字符串变为有效 URL）
- **THEN** 系统 SHALL 触发 NodeView 重建，使 `plantuml` 代码块从普通代码块切换为图表视图

#### Scenario: 服务器地址从非空变为空
- **WHEN** 用户清空 PlantUML 服务器地址
- **THEN** 系统 SHALL 触发 NodeView 重建，使图表视图回退为普通代码块

#### Scenario: 语言切换正常重建
- **WHEN** 用户将代码块语言从 `plantuml` 改为其他语言（或反向）
- **THEN** 系统 SHALL 按现有逻辑触发 NodeView 重建
