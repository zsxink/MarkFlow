## ADDED Requirements

### Requirement: PlantUML HTTP 客户端可重复解析
项目 SHALL 锁定并安装 `@tauri-apps/plugin-http`，使 PlantUML 渲染模块、其测试和前端构建能够解析该客户端依赖。

#### Scenario: 干净安装后的前端质量验证
- **WHEN** 从锁定依赖安装项目并执行 `npm test` 与 `npm run build`
- **THEN** PlantUML 渲染模块应解析 `@tauri-apps/plugin-http`
- **THEN** 命令不得因该模块缺失而失败
