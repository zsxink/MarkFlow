## Context

当前 CI 流程（`.github/workflows/ci.yml`）包含前端测试、构建、Rust 测试/格式化/lint 和依赖审计，但缺少：
1. 独立的 TypeScript 类型检查（当前嵌在 `npm run build` 中）
2. bundle size 预算检查（`scripts/check-bundle-size.sh` 已存在但未接入 CI）
3. vitest 覆盖率阈值
4. 包体积基线文档

`libc` 依赖已在 `src-tauri/src/commands/files.rs` 中用于进程存活检测（`libc::kill(pid, 0)`），需保留。

## Goals / Non-Goals

**Goals:**
- CI 添加 `tsc --noEmit` 独立类型检查步骤
- CI 接入 `check-bundle-size.sh` 脚本
- vitest.config.ts 添加覆盖率阈值（50% statements/functions/lines, 40% branches）
- 新增 `docs/bundle-baseline.md` 记录当前包体积基线

**Non-Goals:**
- 不移除 libc 依赖（已被使用）
- 不修改现有 CI 步骤的顺序或行为
- 不添加 Rust 测试覆盖率（cargo-tarpaulin）
- 不提高 vitest 覆盖率阈值（先设低，后续提高）

## Decisions

### CI 步骤顺序

在现有 CI 步骤中插入：
- `Type check` 在 `Run tests` 之后、`Check capability security configuration` 之前
- `Check bundle size` 在 `Build frontend` 之后、`Run Rust tests` 之前

理由：类型检查应在构建之前运行，bundle size 检查需要构建产物。

### Vitest 覆盖率阈值

设置为 50% statements/functions/lines, 40% branches。这是保守阈值，后续逐步提高。

### 包体积基线

运行 `npm run analyze` 并将结果记录到 `docs/bundle-baseline.md`，包含当前三个最大 chunk 的大小和内容描述。

## Risks / Trade-offs

- 覆盖率阈值可能因代码变更而需要调整，但 50% 是合理的起始点
- bundle size 检查可能在字体文件缺失时误报（CI 环境），但脚本已有容错处理
