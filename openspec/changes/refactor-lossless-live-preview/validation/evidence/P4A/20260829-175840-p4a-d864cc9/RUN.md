# RUN 记录 — P4A 任务 6.8 全门禁复核 run 20260829-175840-p4a-d864cc9

- 阶段/任务：P4A（tasks.md §6）任务 6.8 —— 运行全 gate 与独立 reviewer，记录 P4A 终态
- 仓库：`/Users/xian/Project/book/MarkFlow`（`git rev-parse --show-toplevel` 实测）
- branch：`test/issue-255-lossless-byte-contract`
- 基线 commit：`d864cc970da94929e5a7cf3509be0d42eda72b92`（短 `d864cc9`，工作树 clean）
- 环境：见同目录 `ENVIRONMENT.md`（不可变）
- 运行方式：由执行 agent 逐条运行；独立 Reviewer 以 fresh context 复核并亲自重跑关键门禁

## 1. 目的

P4A 其余任务（6.1/6.2 完成并复核、6.3 ADR 冻结为 `SPIKE_COMPLETE_NO_CORE_IR`、6.4/6.6/6.7
NOT APPLICABLE、6.5 owner registry 本地形态已实施）已在基线内。6.8 要求对 P4A 收官状态
运行全 gate，供独立 Reviewer 判定终态 `SPIKE_COMPLETE_NO_CORE_IR` 可记录，且
`coreRenderIr` 保持 default-off（产品侧无此 flag，即未实现的最强 default-off 形式）。

## 2. 运行前确认（协议 §1）

- [x] 仓库根目录确为 `/Users/xian/Project/book/MarkFlow`，branch 为 Issue #254 工作分支
- [x] 记录 start commit `d864cc9`，工作树 clean
- [x] 既有变更归属：已全部按 AGENTS.md 分组提交（启动步骤 1），无残留
- [x] 前置阶段（P3 及之前）已 Go
- [x] 对应 OpenSpec strict validation 通过（见下）
- [x] 不覆盖用户真实文档（本 run 无用户文档访问）

## 3. 门禁原始输出（均在 `gate-output/`）

每条命令输出独立保存为一个 `.log`，退出码独立保存为同名 `.exitcode`。

| 门禁 | 命令 | 退出码 | 摘要 |
| --- | --- | --- | --- |
| 单元测试 | `npm test` | 0 | 45 files / 572 tests passed |
| 类型 | `npx tsc --noEmit` | 0 | 0 错 |
| 构建 | `npm run build` | 0 | built in 3.55s（chunk>500kB 警告为既有信息级） |
| Rust fmt | `cargo fmt --manifest-path src-tauri/Cargo.toml --check` | 0 | 无差异 |
| Rust clippy | `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` | 0 | 无警告 |
| Rust test | `cargo test --manifest-path src-tauri/Cargo.toml` | 0 | 153 passed; 0 failed |
| OpenSpec strict | `npx openspec validate refactor-lossless-live-preview --strict` | 0 | `Change 'refactor-lossless-live-preview' is valid` |
| OpenSpec all | `npx openspec validate --all` | 0 | 61 passed, 0 failed (61 items) |
| archive sync | `bash scripts/check-archive-synced.sh` | 0 | `OK: all archived delta specs synced to main specs` |
| byte-contract | `npm run test:byte-contract` | 0 | fixtures verified:true stable:true changed:[]；L0 pos 24/neg 23；L1 pos 95/neg 93；ok:true |
| e2e smoke | `npm run test:e2e`（`node e2e/run.mjs smoke`） | 0 | tauri debug build + WDIO `5 passing`，Spec Files 1 passed |
| e2e regression | `npm run test:e2e:regression`（`node e2e/run.mjs regression`） | 0 | WDIO 1 passing |

## 4. 无改动/无 fallback 说明

本 run 未修改任何产品代码；门禁全部在干净基线 `d864cc9` 真实运行，无一条被跳过或降级。
e2e 在本机 Aqua GUI 会话可用（协议 §4 无环境限制）。

## 5. 桌面 E2E 说明

按协议 §5：`e2e/run.mjs` 执行 `npm run test:e2e:build`（tauri debug 构建
`--features e2e`）后以 WDIO + WebKit driver 驱动 `src-tauri/target/debug/markflow`。
smoke 5 passing（lossless editor mode-switch、save/reload、settings）；regression 1 passing
（macOS native PDF export）。证据为真实运行产物，日志见 `gate-output/`。

## 6. 结论（经独立 Reviewer 复核）

- 12/12 gate exit 0；identity/range 门禁（6.2 Lezer 0 range 失败 + 本 run 全 gate）成立。
- ADR `adr-parser-source-map-render-ir.md` 已冻结终态 `SPIKE_COMPLETE_NO_CORE_IR`；
  6.4/6.6/6.7 NOT APPLICABLE（ADR §3.3 依据）。
- 产品侧 `coreRenderIr` flag grep 0 命中 → 未实现，即 default-off 最强形式。
- **终态：`SPIKE_COMPLETE_NO_CORE_IR`**（spike 完成；产品保持 local projection +
  source fallback；**不是**实现失败，也不是 Core IR 已完成）。P4A 验证终态已写入
  `validation/phases/P4A.md`；tasks.md §6 相应勾选与 NOT APPLICABLE 备注已更新。
- 独立 Reviewer 结论见同目录 `REVIEW.md`（PASS，同意记录终态）。
