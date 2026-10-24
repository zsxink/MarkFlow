# Spec Delta

## MODIFIED Requirements

### Requirement: Homebrew cask 覆盖双架构

发布脚本 SHALL 为 macOS 生成同时包含 `on_arm` 与 `on_intel` 段的 cask，两段各自引用对应架构 DMG 的真实下载地址与 sha256；任一架构资产缺失时 SHALL 有可见告警，不静默生成单架构 cask 而无提示。cask 各 url SHALL NOT 携带 `verified:` 参数——cask url 与 homepage 同在 github.com 域名下，Homebrew 本就无需该声明，且它已被 `brew audit` 废弃；生成的 cask SHALL 不含该废弃参数，使 tap 产物保持可审计。

#### Scenario: 双架构 cask 生成
- **WHEN** Release 资产同时包含 aarch64 与 x86_64 DMG，Homebrew 发布作业运行
- **THEN** 生成的 cask 同时含 `on_arm` 与 `on_intel` 段，两个 sha256 均为对应 DMG 的真实值

#### Scenario: 资产缺失时可见告警
- **WHEN** 任一架构 DMG 资产缺失，Homebrew 发布作业运行
- **THEN** 作业输出包含该架构缺失的告警信息

#### Scenario: cask url 不携带废弃的 verified 参数
- **WHEN** Homebrew 发布作业生成 cask 并同步到 tap
- **THEN** `on_arm` 与 `on_intel` 两段的 url 均不含 `verified:` 参数，cask 可通过 `brew audit`
