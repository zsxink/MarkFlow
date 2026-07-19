# regression-coverage Specification

## Purpose
定义 Rust 核心、前端高风险路径和拉取请求质量门禁的可执行回归覆盖要求。

## Agent Context
- **源码入口：** `src/lib/editor.serializer.test.ts`、`src/lib/documentExport.test.ts`、`src-tauri/src/error.rs` 与 `.github/workflows/ci.yml`。
- **关联规范：** `dep-audit-ci`、`atomic-save`、`safe-http-fetch`、`file-tree-architecture`。
- **不变量：** 高风险故障路径必须有自动化覆盖；测试必须确定性且离线；回归门禁不得仅依赖人工验证。
- **验证：** `npm test`；`cargo test --manifest-path src-tauri/Cargo.toml`；`npx openspec validate regression-coverage --strict`。

## Requirements

### Requirement: Rust 核心行为具有可执行的回归覆盖

The project SHALL maintain automated Rust tests for workspace/path and symlink validation, atomic save success and failure recovery, settings persistence, URL/DNS/redirect/response-limit enforcement, file-tree filtering, watcher event coalescing, and conflict-related backend decisions.

#### Scenario: 安全和持久性回归套件运行
- **WHEN** `cargo test` 执行
- **THEN** 测试工具应执行路径包含、符号链接拒绝、原子写入失败保留和 HTTP 限制/限制行为的测试
- **THEN** 该命令应报告至少一项已执行的 Rust 测试

#### Scenario: 覆盖高风险故障路径
- **WHEN** 测试夹具注入写入、重命名、网络、观察者或冲突失败
- **THEN** 测试应断言返回的错误或结果状态
- **THEN** 产品合同要求保存的，应保留原始文件或先前文件状态

### Requirement: Rust 集成夹具是确定性且离线的

Rust 集成测试 MUST 使用临时目录和本地 HTTP 固定装置或可注入传输，并且不得需要公共 DNS 或互联网访问。

#### Scenario: 文件系统测试隔离他们的数据
- **WHEN** 文件系统集成测试创建或修改文件
- **THEN** 它应该使用一个唯一的临时目录
- **THEN** 测试后应清理治具

#### Scenario: HTTP 测试在本地测试真实的有界响应
- **WHEN** 网络测试验证流媒体限制、重定向验证或内容检查
- **THEN** 它应仅与本地测试服务器或受控传输进行通信
- **THEN** 测试应在明确超时的情况下完成

### Requirement: 前端高风险路径有回归覆盖

The frontend test suite SHALL cover safe DOM construction, autosave revision/concurrency behavior, external modification conflicts, large-file fallback, and WYSIWYG/source mode serialization round trips.

#### Scenario: 过时的保存完成不会清除新的编辑
- **WHEN** 保存从修订版 N 开始，编辑在保存解决之前将文档前进到修订版 N+1
- **THEN** 持久状态应保留较新的脏状态

#### Scenario: 模式和后备路径保留内容
- **WHEN** 内容在所见即所得和源模式之间反复切换，或者大文档触发回退路径
- **THEN** 测试应验证内容保持完整且编辑器状态保持一致

### Requirement: 拉取请求强制执行完整的质量门

The required CI workflow SHALL run `npm test`, `npm run build`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, and `npm audit --omit=dev --audit-level=high`.

#### Scenario: 严格审核通过有效变更
- **WHEN** 所有前端、Rust、格式和依赖项检查均通过
- **THEN** CI 作业应通过拉取请求

#### Scenario: 严格的 Rust lint 或格式化失败块合并
- **WHEN** Clippy 在 `-D warnings` 下发出警告，或者 Rust 格式与 `rustfmt` 不同
- **THEN** CI 作业将会失败

#### Scenario: 高或严重生产漏洞区块合并
- **WHEN** 生产依赖审核报告高危漏洞
- **THEN** CI 作业将会失败
- **THEN** 仅中等调查结果不得低于审核阈值
