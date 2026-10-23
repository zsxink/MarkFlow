# Tasks

## 1. Release 工作流改造

- [x] 1.1 修改 `.github/workflows/release.yml`：matrix 新增 `macos-latest / x86_64-apple-darwin` 条目；两个 macOS job 的 tauri-action 步骤传 `args: --target ${{ matrix.rust_target }}`；DMG 外观三步 glob 改为 `src-tauri/target/${{ matrix.rust_target }}/release/bundle/dmg/*.dmg`；releaseBody 的 macOS 下载说明区分 Apple Silicon（`_aarch64.dmg`）与 Intel（`_x86_64.dmg`）；验证 `node -e "require('js-yaml')..."` 或 python yaml 解析 workflow 语法合法（或 actionlint 若可用）
  - 完成：matrix 四条目（两个 macOS）；args 用 `matrix.platform == 'macos-latest' && format('--target {0}', matrix.rust_target) || ''` 条件派生（共享步骤模板下 macOS 传、Windows/Linux 留空）；三处 DMG glob 改 target 域；releaseBody 拆 Apple Silicon / Intel 两行。`node` + js-yaml 解析通过（actionlint 本机不可用）。
- [x] 1.2 在 DMG 外观步骤前新增 macOS 架构自检步骤（`if: matrix.platform == 'macos-latest'`）：对 `src-tauri/target/${{ matrix.rust_target }}/release/bundle/macos/*.app/Contents/MacOS/MarkFlow` 执行 `lipo -info`，断言输出包含 `${{ matrix.rust_target == 'aarch64-apple-darwin' && 'arm64' || 'x86_64' }}`，不匹配 `exit 1`；验证 YAML 解析合法
  - 完成：`Verify app binary architecture` 步骤置于 Build 之后、DMG 三步之前；期望架构由 matrix 表达式派生；`grep -qi` 兼容 lipo 对 fat/非 fat 文件的大小写差异；不匹配 `exit 1`。YAML 解析通过。

## 2. 流水线回归测试

- [x] 2.1 扩展 `src/__tests__/release-pipeline.test.ts`：断言 release.yml matrix 含 `x86_64-apple-darwin` 条目、build 步骤含 `--target` 传参、DMG glob 为 target 域路径、releaseBody 区分两种 macOS 架构、homebrew-publish.sh 仍含 `on_intel` 段与 `x86_64` 资产名；验证 `npx vitest run src/__tests__/release-pipeline.test.ts` 通过
  - 完成：新增 describe 块（6 个用例），含 matrix 双条目、args 条件传 `--target`、lipo 架构自检、DMG glob target 域（断言恰好 3 处且旧路径零残留）、releaseBody 双架构行、homebrew `on_intel` 段与 `MarkFlow_#{version}_x86_64.dmg` 资产名。`npx vitest run` 9/9 通过。
- [x] 2.2 对照 issue 验收清单静态走查（双 DMG 产出、各自外观断言、cask 双段零改动、下载说明区分、CI 时长增量评估），在 tasks.md 记录走查结论；验证 `npm test` 与 `node scripts/check-layering.mjs` 通过
  - 走查结论（对照 #374 验收清单）：
    1. 双 DMG 产出：matrix 含两个 macOS 条目；`Install Rust stable` 已装 `targets: ${{ matrix.rust_target }}`（x86_64 std 就绪）；tauri-action 按 target 架构命名产物 `MarkFlow_<version>_x86_64.dmg`，与 homebrew 脚本期望的资产名一致。
    2. 各自外观断言：DMG 三步的 `if: matrix.platform == 'macos-latest'` 天然命中两个 macOS job；target 域 glob 保证每个 job 只碰自己的 DMG；断言失败即 job 失败，配合 `releaseDraft: true` 草稿不会发布。
    3. cask 双段零改动：`git diff` 确认 `scripts/homebrew-publish.sh` 未动；脚本本就下载双架构 DMG 并写 `on_arm`/`on_intel` 双段双 sha256，x86_64 资产上线后自动生效；任一资产缺失输出可见 warning，不静默生成单架构 cask。
    4. 下载说明区分：releaseBody 拆为 `macOS (Apple Silicon)` → `_aarch64.dmg`、`macOS (Intel)` → `_x86_64.dmg` 两行。
    5. CI 时长：新增第 4 个 matrix job 并行执行（fail-fast: false），不阻塞其他平台；x86_64 全量交叉编译约 +5~8 分钟，Release 总时长 ≈ 最慢 job，相对三平台约 8 分钟基线增量可接受（issue 验收口径）。
    6. 风险如实保留：Intel 包无真机启动验证，以 `lipo -info` 架构断言 + DMG 外观断言为发布前最低门槛（design 风险节已注明）。
  - `npm test` 与 `node scripts/check-layering.mjs` 通过（见实施记录）。
