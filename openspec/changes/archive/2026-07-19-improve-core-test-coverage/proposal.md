## Why

核心编辑、保存、设置与文件操作缺少可执行的前端回归覆盖，且 PlantUML 的 HTTP 插件虽已声明在依赖中，却未被当前安装状态解析，导致完整测试与构建无法通过。

## What Changes

- 为编辑器扩展、设置、文件保存、存储 IPC、工具栏和文件右键菜单补充独立 Vitest 测试。
- 确保 PlantUML HTTP 插件可从锁定依赖中安装和解析，使完整前端测试与构建可执行。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `regression-coverage`: 前端高风险交互与 IPC 封装纳入自动化回归覆盖，完整质量命令可在干净安装后执行。
- `plantuml-render`: PlantUML HTTP 客户端依赖必须被锁定，以支持可重复安装和验证。

## Impact

- 新增 `src/lib/` 和 `src/components/` 下的 Vitest 测试文件。
- 更新锁定依赖，以解析既有的 `@tauri-apps/plugin-http` 生产依赖。
