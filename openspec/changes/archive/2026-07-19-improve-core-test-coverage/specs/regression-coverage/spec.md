## ADDED Requirements

### Requirement: 核心前端交互具有模块级回归覆盖
前端测试套件 SHALL 为编辑器扩展、设置面板、活动文档保存、存储 IPC、工具栏和文件上下文菜单提供独立的模块级测试。测试 MUST mock Tauri API，且不得依赖真实文件系统或网络服务。

#### Scenario: 核心模块测试在离线环境运行
- **WHEN** 执行 `npm test`
- **THEN** 测试套件应执行每个核心模块对应的独立测试文件
- **THEN** Tauri IPC 调用和外部服务必须被 mock

#### Scenario: 保存和设置回归得到检测
- **WHEN** 保存目标文件不存在、文件被外部修改，或设置值超出允许范围
- **THEN** 测试应验证对应的对话、取消或边界值行为
