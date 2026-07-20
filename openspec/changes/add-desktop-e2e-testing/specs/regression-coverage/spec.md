## MODIFIED Requirements

### Requirement: 拉取请求强制执行完整的质量门

The required CI workflows SHALL run `npm test`, `npm run build`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm audit --omit=dev --audit-level=high`, and the desktop E2E smoke command. The E2E smoke check SHALL run as an independently diagnosable job against a test-only Tauri build and SHALL become required after its stabilization period; the extended desktop regression suite SHALL remain independently triggerable without slowing the unit-test command.

#### Scenario: 严格审核通过有效变更
- **WHEN** 所有前端、Rust、格式、依赖项和桌面 E2E 冒烟检查均通过
- **THEN** CI 作业应通过拉取请求

#### Scenario: 严格的 Rust lint 或格式化失败块合并
- **WHEN** Clippy 在 `-D warnings` 下发出警告，或者 Rust 格式与 `rustfmt` 不同
- **THEN** CI 工作流将会失败

#### Scenario: 高或严重生产漏洞区块合并
- **WHEN** 生产依赖审核报告高危漏洞
- **THEN** CI 工作流将会失败
- **THEN** 仅中等调查结果不得低于审核阈值

#### Scenario: 桌面冒烟回归阻断合入
- **WHEN** 测试专用 Tauri 构建失败，或任一 required 桌面 E2E 冒烟路径失败
- **THEN** 独立 E2E 工作流 SHALL 失败并阻止拉取请求合入
- **THEN** 现有 `npm test` 结果 SHALL 保持独立可见，不得用重跑整个单元套件代替 E2E 诊断
