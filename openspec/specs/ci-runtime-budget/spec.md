# ci-runtime-budget Specification

## Purpose
约束 CI 的执行时间：把不依赖 Tauri 系统库的检查与 apt 安装解耦，限制系统依赖安装的网络长尾，并保证每个检查都有超时边界，使 PR 反馈时间可控。

## Requirements

### Requirement: 无系统库依赖的检查独立于 apt 安装

CI SHALL 将不依赖 Tauri Linux 系统库的检查放在不执行 apt 安装的 job 中。这些检查 MUST NOT 因 apt 步骤耗时而延迟出结果。

#### Scenario: 前端与规范检查不等待系统库
- **WHEN** CI 运行到 `web-checks` job
- **THEN** 该 job 不执行任何 `apt-get` 命令
- **THEN** `npm test`、`npx tsc --noEmit`、OpenSpec 校验、archive 同步校验、分层门禁与前端构建在该 job 内完成

#### Scenario: Rust 检查独占系统库安装
- **WHEN** CI 运行到 `rust-checks` job
- **THEN** 只有该 job 安装 webkit/gtk 等 Tauri Linux 系统库
- **THEN** 该 job 内运行 `cargo test`、`cargo fmt -- --check` 与 `cargo clippy --all-targets -- -D warnings`

#### Scenario: 两个 job 并行推进
- **WHEN** PR 触发 CI
- **THEN** `web-checks` 与 `rust-checks` 相互独立，任一 job 的耗时不阻塞另一 job 的启动

### Requirement: 系统依赖安装复用包缓存

CI 安装 Tauri Linux 系统库时 SHALL 缓存已下载的 deb 包，缓存命中时 MUST NOT 重新从网络下载这些包。

#### Scenario: 缓存命中跳过下载
- **WHEN** apt 包缓存命中
- **THEN** 安装步骤以「禁止下载」模式安装依赖
- **THEN** 安装步骤不产生对软件源的大体积下载

#### Scenario: 缓存失效回退网络
- **WHEN** 缓存的 deb 包与当前软件源索引不匹配，导致禁止下载的安装失败
- **THEN** 安装步骤回退到正常网络安装
- **THEN** CI 不因缓存失效而失败

### Requirement: 系统依赖安装具备抗抖动与超时保护

CI 安装系统依赖的步骤 SHALL 配置下载重试与连接超时，并 MUST 设置步骤级超时上限，使镜像抖动导致的异常耗时快速失败而非长时间挂起。

#### Scenario: 网络抖动触发重试
- **WHEN** 软件源连接中断或超时
- **THEN** apt 按配置的重试次数重试下载
- **THEN** 单次连接超时不超过 30 秒

#### Scenario: 病态耗时快速失败
- **WHEN** 系统依赖安装超过步骤超时上限
- **THEN** 该步骤失败并结束
- **THEN** 该 job 不继续等待安装完成

### Requirement: CI job 具备超时边界

CI 的每个 job SHALL 声明 job 级超时上限。

#### Scenario: job 挂起被终止
- **WHEN** 某个 job 内的步骤异常挂起
- **THEN** 该 job 在达到超时上限后被终止
