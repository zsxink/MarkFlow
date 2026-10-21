# Spec Delta

## MODIFIED Requirements

### Requirement: Rust 核心行为具有可执行的回归覆盖

The project SHALL maintain automated Rust tests for workspace/path and symlink validation, atomic save success and failure recovery, settings persistence, URL/DNS/redirect/response-limit enforcement, file-tree filtering, watcher event coalescing, and conflict-related backend decisions.

#### Scenario: 安全和持久性回归套件运行
- **WHEN** `cargo test` 执行
- **THEN** 测试工具应执行路径包含、符号链接拒绝、原子写入失败保留和 HTTP 限制行为的测试

#### Scenario: 覆盖高风险故障路径
- **WHEN** 测试夹具注入写入、重命名、网络、观察者或冲突失败
- **THEN** 测试应断言返回的错误或结果状态
- **THEN** 产品合同要求保存的，应保留原始文件或先前文件状态
