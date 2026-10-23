# Design

## Context

现状见 proposal.md — Why。约束来自实测数据：

- 历史同步骤耗时 26s / 38s / 38s / 92s / **23m35s**，是网络长尾而非包数量问题。
- 除 apt 外，原 `audit-and-test` 全部步骤合计约 2.5 分钟。
- 安装集合固定为 `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev`，连带 179 个包、63.7MB。
- `cargo test` / `clippy` 使用 dev profile；`tauri::generate_context!()` 只在 `custom-protocol`（release）下才嵌入 `frontendDist`，因此 Rust job 不依赖 `dist/`。已用「移走 `dist/` 后 `cargo check --tests` 通过」验证。

## Goals / Non-Goals

**Goals**

- 让 PR 的主要反馈（test / type / build / spec）不再受 apt 长尾影响。
- 让 apt 步骤在缓存命中时基本不产生网络下载。
- 让任何单步异常耗时都在有限时间内失败，而不是拖到 20 分钟以上。

**Non-Goals**

- 不改业务代码、依赖版本、测试内容或门禁覆盖的检查项集合。
- 不引入容器镜像、自建 runner 或第三方 apt 缓存 action（见 Decisions）。
- 不动 `release.yml`（发布构建不走 PR 反馈路径）。

## Decisions

### 1. 拆成 `web-checks` + `rust-checks`，而不是继续单 job

单 job 无法让 apt 之后的检查提前出结果。拆分的分界线取「是否需要 Tauri 系统库」：

- `web-checks`：npm ci / audit / test / tsc / capability / openspec / archive-sync / layering / vite build / bundle-size。
- `rust-checks`：apt / cargo test / fmt / clippy。

替代方案：在单 job 内把 apt 挪到最后。缺点是 apt 失败时前端检查的结论仍要等 apt 结束，且 Rust 步骤与 apt 强耦合，无法并行。

### 2. Rust job 不构建前端

已验证 dev profile 不嵌入 `frontendDist`（见 Context）。因此 Rust job 无需 `npm ci` / `vite build`，省掉 node 安装与前端构建时间。

风险：若将来 Rust 测试需要 `dist/`（例如走 `custom-protocol` 的 e2e 编译），该 job 会失败。缓解：CI 失败信息会直接指向缺失的 `frontendDist`；届时在 `rust-checks` 前补一步最小化 `npx vite build` 即可，不影响 job 划分。

### 3. apt 缓存用 `actions/cache` + `--no-download`，不用第三方 action

`actions/cache@v4` 缓存 `/var/cache/apt/archives`（deb 文件本身），命中时以 `apt-get install --no-download` 安装；失败则回退网络安装。

- 相比 `awalsh128/cache-apt-pkgs-action`：少一个第三方 action 依赖，也不需要它额外安装 `apt-fast`（该 action 每次还要 `curl` 拉 quick-install 脚本，本身又是一个网络依赖点）。代价是不缓存「已解包文件」，命中时仍需本地 dpkg 解包，但这部分是磁盘 IO，不在抖动长尾里。
- 相比把依赖塞进容器镜像：改动面更大，且要维护镜像构建流水线，超出本 issue 范围。
- 缓存 key 带 ISO 周号（`date -u +%Y-%W`）+ `restore-keys` 前缀：既避免 key 永不轮换导致缓存长期过期，又能命中上周的近似缓存。

### 4. 抗抖动参数与超时

- `Acquire::Retries=5`、`Acquire::http::Timeout=30`、`Acquire::https::Timeout=30`：把单连接卡死从「485s 停顿」压到最多 30s 后重试。
- apt 安装步骤 `timeout-minutes: 8`：正常 26–92s，给足 5 倍余量；超过即失败可重跑。
- job 级 `timeout-minutes`（`web-checks` 10、`rust-checks` 20）：兜住任何未预期的挂起。
- `apt-get update` 也带同样的 `Acquire` 选项，因为长尾日志里停顿发生在 `Get:` 阶段，update 与 install 都会触发。

### 5. 构建步骤改跑 `npx vite build`

`npm run build` = `tsc && vite build`，而同一 job 前面已有 `npx tsc --noEmit`（同一 `tsconfig.json`、同一 `src` 范围）。重复的 `tsc` 对门禁无增量信息，属于过时冗余检查，去掉后构建步骤只剩打包。

保留 `tsc --noEmit` 独立步骤（`ci-type-check` 规范要求），只去掉构建里的重复那次。

### 6. 先修 Linux 编译错误（阻塞项）

main 的 `Run Rust tests` 已在 run 39934417518 上失败：PR #366 拆分 `export.rs` 时，`print_webview` 仍引用被 macOS 门控掉的 `WebviewWindowBuilder` / `WebviewUrl`，`tests.rs` 仍引用被门控掉的 `cleanup_pdf_after_delays`。拆出 `rust-checks` 之前必须先修，否则新 job 继承同样的红。

修法是让门控与真实使用面一致：`print_webview` 在所有桌面平台都注册进 handler，所以它的两个 import 不该门控；反之 `PathBuf` 只在 macOS 分支用到，应当门控。

## Risks / Trade-offs

- [apt 缓存命中但包版本已更新] → `--no-download` 安装会失败，脚本回退到网络安装，只是这一次慢，不会红。
- [拆 job 后 PR 的 required check 名称变化] → 仓库未配置 `required_status_checks`（已查 branch protection），合入不受影响；若将来加必过检查，需要把两个 job 都列上。
- [两个 job 各自 `npm ci`/`cargo` 缓存] → `rust-checks` 不再需要 node，无重复；`web-checks` 的 npm 缓存本来就只有一份。
- [Rust job 少了前端产物] → 见 Decisions 2 的缓解方式。

## Migration Plan

1. 合入后首次运行：apt 缓存未命中，仍走完整网络安装（预期 26–92s，最坏受 8 分钟步骤超时保护）。
2. 该次运行结束由 `actions/cache` 保存 `/var/cache/apt/archives`。
3. 之后每周内命中缓存，apt 步骤变为本地解包。
4. 回滚：`git revert` 单个 commit 即回到单 job 形态，无数据或状态迁移。

## Open Questions

无。
