## Why

CI 缺少前端类型检查独立步骤（当前嵌在 npm run build 中），bundle size 预算脚本未接入 CI，vitest 无覆盖率阈值保障，且无包体积基线文档。这些问题导致质量门禁不完整，类型错误和体积回涨可能被忽略。

## What Changes

- CI 添加 `tsc --noEmit` 独立类型检查步骤（在 Run tests 之后）
- CI 接入 `check-bundle-size.sh` 脚本（在 Build frontend 之后）
- vitest.config.ts 添加覆盖率阈值（50% statements/functions/lines, 40% branches）
- 新增 docs/bundle-baseline.md 记录当前包体积基线
- 保留 libc 依赖（已被 files.rs 用于进程存活检测）

## Capabilities

### New Capabilities
- `ci-type-check`: CI 中独立的 TypeScript 类型检查步骤
- `vitest-coverage-threshold`: vitest 覆盖率阈值配置

### Modified Capabilities
- `dep-audit-ci`: CI 步骤中新增 tsc 类型检查和 bundle size 检查
- `bundle-budget`: 补充包体积基线文档
- `regression-coverage`: CI 门禁新增类型检查

## Impact

- `.github/workflows/ci.yml`: 新增 2 个 CI 步骤
- `vitest.config.ts`: 新增 coverage 配置
- `docs/bundle-baseline.md`: 新增文件
- 不影响现有功能，纯增量改进
