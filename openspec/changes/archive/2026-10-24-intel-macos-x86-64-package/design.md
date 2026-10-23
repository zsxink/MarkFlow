# Design

## Context

`.github/workflows/release.yml` 的 build matrix 目前三个条目，macOS 仅 `aarch64-apple-darwin`（`macos-latest` 即 arm64 runner，原生构建，未传 `--target`）。DMG 外观三步（style-dmg / collect-dmg-appearance / re-upload）以 `if: matrix.platform == 'macos-latest'` 门控、glob `src-tauri/target/release/bundle/dmg/*.dmg`。`scripts/homebrew-publish.sh` 已实现 `on_arm`/`on_intel` 双段 cask（`download_sha x86_64` 缺失仅 warning）。`src/__tests__/release-pipeline.test.ts` 已从源码层面锁死流水线行为（Issue #320 先例）。关键约束：给 tauri-action 传 `--target` 后，Tauri 产物路径从 `target/release/bundle/...` 变为 `target/<target>/release/bundle/...`，外观步骤 glob 必须同步改。

## Goals / Non-Goals

**Goals:**

- 方案 A：新增独立 x86_64 矩阵条目，两个 DMG 各自产出、各自过外观断言
- Homebrew 脚本零改动
- 流水线行为从源码层面被测试锁死

**Non-Goals:**

- 不做 universal binary（方案 B，体积翻倍 + cask 重写，issue 已明确倾向 A）
- 不在 CI 里做 Intel 真机启动验证（无 Intel runner；以 `lipo -info` 架构断言为最低保障）
- 不改 DMG 外观链路脚本、不改 `tauri.conf.json`

## Decisions

1. **新增 matrix 条目 `platform: macos-latest / rust_target: x86_64-apple-darwin`，两个 macOS 条目都用 `platform: macos-latest`。**
   现有 `if: matrix.platform == 'macos-latest'` 的 DMG 外观步骤天然同时命中两个 macOS job，无需改条件。备选 `macos-13` Intel 原生 runner 面临退役且缓存/镜像生态差，不取。

2. **两个 macOS job 都传 `args: --target ${{ matrix.rust_target }}`，Windows/Linux 保持不传。**
   交叉编译必需；arm job 一并传使两个 macOS job 完全对称、产物路径统一为 target 域，glob 无需按 job 分支。Windows/Linux 不传以避免扰动现有原生构建路径与缓存键。tauri-action 的 `args` 会透传给 `tauri build`。

3. **DMG 三步 glob 改为 `src-tauri/target/${{ matrix.rust_target }}/release/bundle/dmg/*.dmg`。**
   与决策 2 的产物路径对应；两个 macOS job 各自 glob 到自己的 DMG。Windows/Linux job 该步骤本就不执行。

4. **新增架构自检步骤（仅 macOS job）：`lipo -info` 检查 `.app/Contents/MacOS/MarkFlow` 主二进制，grep 期望架构（`arm64` 对应 aarch64 作业、`x86_64` 对应 x86_64 作业），不匹配则 `exit 1`。**
   直接回应 issue 备注的「纯交叉编译包未验证」风险：至少锁定二进制架构正确，防止 `--target` 传递失效退化为双 arm 包而不自知。期望值由 matrix 表达式派生，不硬编码重复。

5. **`releaseBody` 的 macOS 行拆为两行：Apple Silicon 下载 `_aarch64.dmg`、Intel 下载 `_x86_64.dmg`。**

6. **扩展 `src/__tests__/release-pipeline.test.ts` 而非新建文件。**
   沿用其「读源码断言、剔除注释」的既有模式，新增：matrix 含 `x86_64-apple-darwin` 条目、macOS job 的 build 步骤含 `--target ${{ matrix.rust_target }}`、DMG glob 为 target 域路径、releaseBody 区分两种架构、homebrew 脚本仍含 `on_intel` 段模板（防误删）。

## Risks / Trade-offs

- [风险] 交叉编译因原生依赖（如 ring/openssl 类 crate）在 x86_64 链接失败 → Tauri v2 栈以纯 Rust + 系统 WebKit 为主，无 openssl-sys；若失败，Release job 报错可见，草稿不会被自动发布（releaseDraft: true）
- [风险] `--target` 使 arm job 的 rust-cache 键变化，首次构建变慢 → 一次性成本，三平台并行下 Release 总时长增量以新增 x86_64 job 为主（约 +5~8 分钟），issue 验收「可接受」
- [权衡] Intel 包未在真机启动过 → 在 Release 说明中如实标注；架构断言 + 外观断言作为发布前最低门槛，后续有真机再补启动验证
- [权衡] 用 `lipo -info` 而非解析 DMG 内文件 → DMG 需挂载才能检查内部，.app 在 bundle/macos/ 下直接可查，构建产物同源（同一 `tauri build` 产出），等价且更简单
