# Spec Delta

## MODIFIED Requirements

### Requirement: 拉取请求强制执行完整的质量门

The required CI workflow SHALL run `npm test`, the frontend build, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, and `npm audit --omit=dev --audit-level=high`.

The frontend build gate SHALL consist of a TypeScript type check and a Vite bundle build. Both SHALL run on every pull request. The type check and the bundle build MAY be invoked as separate steps, so the type checker does not have to be executed twice when the same pull request already runs a standalone type check.

#### Scenario: 严格审核通过有效变更
- **WHEN** 所有前端、Rust、格式和依赖项检查均通过
- **THEN** CI 作业应通过拉取请求

#### Scenario: 严格的 Rust lint 或格式化失败块合并
- **WHEN** Clippy 在 `-D warnings` 下发出警告，或者 Rust 格式与 `rustfmt` 不同
- **THEN** CI 作业将会失败

#### Scenario: 高或严重生产漏洞区块合并
- **WHEN** 生产依赖审核报告高危漏洞
- **THEN** CI 作业将会失败

#### Scenario: 前端构建门禁覆盖类型与打包
- **WHEN** CI 运行前端构建门禁
- **THEN** TypeScript 类型检查执行一次，类型错误使 CI 失败
- **THEN** Vite 打包执行，打包失败使 CI 失败
