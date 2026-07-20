## MODIFIED Requirements

### Requirement: PlantUML 服务器设置
系统 SHALL 提供一个名为"PlantUML 服务器地址"的可持久化设置，默认值 MUST 为空字符串。设置界面 MUST 明确说明：使用外部 PlantUML 服务器会将该图表文本发送给第三方，存在隐私与数据外泄风险；敏感内容 SHALL 建议使用自建服务器。

系统 MUST 确保 PlantUML 的 HTTP 请求通过 Tauri capability ACL 授权。capability 配置 MUST 在 `tauri.conf.json` 的 `app.security.capabilities` 中显式启用，且 URL scope MUST 覆盖用户配置的 HTTP/HTTPS 服务器地址（包括自定义端口）。

#### Scenario: 默认设置不渲染
- **WHEN** 用户未配置 PlantUML 服务器地址
- **THEN** 系统 SHALL 保持设置值为空，并且不为 PlantUML 代码块发起任何网络请求

#### Scenario: 用户保存自建服务器地址
- **WHEN** 用户输入并保存有效的自建 PlantUML 服务器地址
- **THEN** 系统 SHALL 持久化该地址，并将其用于后续 PlantUML 图表请求

#### Scenario: capability 未启用时渲染失败并有明确日志
- **WHEN** `plantuml-http-capability` 未在 `tauri.conf.json` 中启用
- **THEN** PlantUML 渲染请求 SHALL 被 Tauri ACL 拒绝，日志 SHALL 记录 `url not allowed on the configured scope`

#### Scenario: capability URL scope 覆盖自建服务器
- **WHEN** 用户配置的自建 PlantUML 服务器地址为 `http://localhost:8080/plantuml`
- **THEN** capability URL scope SHALL 允许该请求通过 ACL 校验

## REMOVED Requirements

_无删除_
