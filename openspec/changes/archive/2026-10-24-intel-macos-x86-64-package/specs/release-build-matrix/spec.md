# Spec Delta

## Purpose

定义 MarkFlow Release 流水线的产物矩阵契约：每个受支持平台与架构都产出对应的安装包，macOS 同时提供 Apple Silicon 与 Intel 包，Homebrew cask 覆盖双架构，下载说明与产物一一对应。

## ADDED Requirements

### Requirement: Release 产物矩阵覆盖受支持平台与架构

Release 流水线 SHALL 为 Windows x64、macOS aarch64、macOS x86_64、Linux x64 各产出一组安装包，其中 macOS SHALL 同时产出 `MarkFlow_<version>_aarch64.dmg` 与 `MarkFlow_<version>_x86_64.dmg` 两个独立 DMG。macOS x86_64 包 SHALL 在 arm64 runner 上通过显式传递 `--target x86_64-apple-darwin` 交叉编译构建。

#### Scenario: Release 产物包含双架构 DMG
- **WHEN** 以 `v*` tag 触发 Release 流水线
- **THEN** 草稿 Release 资产同时包含 `MarkFlow_<version>_aarch64.dmg` 与 `MarkFlow_<version>_x86_64.dmg`

#### Scenario: Intel Mac 有可下载安装包
- **WHEN** Intel Mac 用户打开 Release 页面
- **THEN** 存在可直接下载安装的 x86_64 DMG

### Requirement: 交叉编译产物架构正确性自检

每个 macOS 构建作业 SHALL 对产物 .app 的主二进制执行架构检查（如 `lipo -info`），并断言其二进制架构与该作业的目标架构一致（aarch64 作业为 arm64，x86_64 作业为 x86_64）；断言失败 SHALL 使作业失败。

#### Scenario: x86_64 作业产物架构断言
- **WHEN** macOS x86_64 作业完成构建
- **THEN** .app 主二进制架构检查输出包含 x86_64，作业通过

#### Scenario: 架构不匹配导致作业失败
- **WHEN** 构建配置漂移导致产物主二进制不包含目标架构
- **THEN** 架构自检步骤失败，作业标记为失败，草稿不被发布

### Requirement: DMG 外观断言按作业独立执行

DMG 外观归一化与断言 SHALL 在每个 macOS 作业内对该作业自己产出的 DMG 执行（按 target 域产物路径定位），任何架构的 DMG 未通过断言 SHALL 使对应作业失败。

#### Scenario: 两个 macOS 作业各自断言
- **WHEN** Release 流水线的两个 macOS 作业分别完成构建
- **THEN** 每个作业对自己的 DMG 执行外观归一化与断言，互不影响

### Requirement: Homebrew cask 覆盖双架构

发布脚本 SHALL 为 macOS 生成同时包含 `on_arm` 与 `on_intel` 段的 cask，两段各自引用对应架构 DMG 的真实下载地址与 sha256；任一架构资产缺失时 SHALL 有可见告警，不静默生成单架构 cask 而无提示。

#### Scenario: 双架构 cask 生成
- **WHEN** Release 资产同时包含 aarch64 与 x86_64 DMG，Homebrew 发布作业运行
- **THEN** 生成的 cask 同时含 `on_arm` 与 `on_intel` 段，两个 sha256 均为对应 DMG 的真实值

#### Scenario: 资产缺失时可见告警
- **WHEN** 任一架构 DMG 资产缺失，Homebrew 发布作业运行
- **THEN** 作业输出包含该架构缺失的告警信息

### Requirement: 下载说明与产物对应

Release 说明 SHALL 按平台与架构区分下载指引：macOS 区分 Apple Silicon（`_aarch64.dmg`）与 Intel（`_x86_64.dmg`），Windows 与 Linux 保持各自指引。

#### Scenario: 下载说明区分 Apple Silicon 与 Intel
- **WHEN** 用户阅读 Release 下载说明
- **THEN** macOS 部分明确指引 Apple Silicon 下载 `_aarch64.dmg`、Intel 下载 `_x86_64.dmg`
