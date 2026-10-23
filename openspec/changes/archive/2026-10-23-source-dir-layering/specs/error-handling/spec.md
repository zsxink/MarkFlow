# Spec Delta

## ADDED Requirements

### Requirement: UI 能力经注入端口上报

基础设施层与引擎层 SHALL NOT 直接 import UI 层来展示提示、对话框或菜单；用户可见反馈 SHALL 通过注入的端口回调完成，端口未注册时 MUST 安全降级并记录结构化日志。

#### Scenario: 基础设施层不反向依赖 UI 层

- **WHEN** 检查 `src/infra/`、`src/editor/`、`src/render/`、`src/export/` 的 import
- **THEN** 不存在指向 `src/ui/` 的 import 语句
- **AND** 提示与对话框能力 SHALL 来自 `src/infra/ui-ports.ts` 暴露的端口

#### Scenario: 端口缺失时的上报降级

- **WHEN** 端口尚未注册而失败路径需要上报用户
- **THEN** 系统 SHALL 记录 `warn` 级结构化日志并继续执行
- **AND** SHALL NOT 因缺少端口抛出未捕获异常

#### Scenario: 已注册端口保持既有用户可见行为

- **WHEN** 端口已由入口装配注册
- **THEN** 用户可见的错误提示、确认对话框与右键菜单行为 SHALL 与分层重构前一致
