# Proposal

## Why

v0.1.3 起 Release 产物 macOS 只有 aarch64 DMG，Intel Mac 用户没有任何可下载的安装包，Homebrew cask 也只生成 `on_arm` 段导致 Intel 用户 `brew install` 失败。

## What Changes

- `.github/workflows/release.yml` 的 build matrix 新增 macOS x86_64 条目（`macos-latest` + `x86_64-apple-darwin`，arm64 runner 交叉编译），产出 `MarkFlow_<version>_x86_64.dmg`
- 两个 macOS job 的 tauri-action 步骤显式传 `args: --target ${{ matrix.rust_target }}`（交叉编译必需；arm job 一并传保持对称）
- DMG 外观收尾三步（归一化 / 断言 / 重传）的 glob 从 `target/release/bundle/dmg` 改为 target 域路径 `src-tauri/target/<rust_target>/release/bundle/dmg`（传 `--target` 后产物路径变化），两个 macOS job 各自在自己 job 内跑外观断言
- 新增架构自检步骤：对构建出的 .app 主二进制跑 `lipo -info`，断言包含期望架构（arm64 / x86_64），防止交叉编译配置漂移
- `releaseBody` 下载说明区分 Apple Silicon（`_aarch64.dmg`）与 Intel（`_x86_64.dmg`）
- `scripts/homebrew-publish.sh` 零改动（已支持 `on_arm`/`on_intel`，x86_64 资产存在后自动生成双段 cask 并写入两个 sha256）
- 扩展 `src/__tests__/release-pipeline.test.ts`，从源码层面锁死上述矩阵与 `--target` 传递方式，防止回归

## Capabilities

### New Capabilities

- `release-build-matrix`: Release 流水线产物矩阵契约——覆盖平台与架构（Windows x64、macOS aarch64 + x86_64、Linux x64）、交叉编译传参、DMG 外观断言按架构各自执行、Homebrew cask 双架构段与下载说明

### Modified Capabilities

（无）

## Impact

- 代码：`.github/workflows/release.yml`（matrix + args + glob + 新步骤 + releaseBody）、`src/__tests__/release-pipeline.test.ts`（新增断言）
- 不改 `scripts/homebrew-publish.sh`、不改 `src-tauri/tauri.conf.json`、不改 DMG 外观链路脚本本身
- Release 时长增加一个 macOS job（并行执行，不阻塞其他平台）
- 真实 Intel 机器启动验证不在 CI 能力范围内，以 `lipo -info` 架构断言作为最低保障，发布说明中注明
