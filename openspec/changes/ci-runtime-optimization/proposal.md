# Proposal

## Why

CI 的 `audit-and-test` 单 job 把「不需要 Tauri 系统库的前端/spec 检查」排在 apt 安装之后。apt 步骤正常 26–92s，但在 run 39892670240 上因镜像长尾抖动跑了 **23m35s**，把整个 job 拖到 25m58s，PR 的 test/type/build 反馈全部被一个网络抖动扣住（issue #365）。同时每次运行都要重新下载 63.7MB / 179 个包，其中两个 webkit 包合计 33MB，是长尾的主要来源。

## What Changes

- 拆分 job：`web-checks`（无 apt）承担 test / audit / tsc / capability / OpenSpec / archive-sync / layering / build / bundle-size；`rust-checks` 独占 apt + cargo test / fmt / clippy。
- apt 步骤不再每次全量下载：用 `actions/cache` 缓存 `/var/cache/apt/archives`，命中时 `apt-get install --no-download`，缓存不匹配时自动回退到网络安装。
- apt 抗抖动：`Acquire::Retries=5`、`http/https::Timeout=30`，并给安装步骤加 `timeout-minutes: 8`，让病态镜像快速失败可重跑，而不是白等 20 分钟以上。
- 两个 job 各加 job 级 `timeout-minutes`（10 / 20），消除「无限挂起」的长尾。
- 移除过时/冗余检查：`npm run build` 已是 `tsc && vite build`，而 `tsc --noEmit` 单独跑过，构建步骤改为只跑 `npx vite build`，避免重复类型检查。

## Capabilities

### New Capabilities

- `ci-runtime-budget`: 定义 CI 的 job 划分、apt 依赖安装的缓存与抗抖动策略、超时边界，以及「无系统库依赖的检查必须独立于 apt 出结果」的约束。

### Modified Capabilities

- `archive-sync-gate`: CI 归档同步校验所在 job 由 `audit-and-test` 改为 `web-checks`。
- `regression-coverage`: 前端构建门禁由「执行 `npm run build`」改为「类型检查 + Vite 打包，两者均必须执行」，允许两步分开跑。

## Impact

影响 `.github/workflows/ci.yml`（唯一实现文件）。不改业务代码、依赖版本或运行时行为；`web-checks` 与 `rust-checks` 并行，合入门禁覆盖的检查项集合不变。
