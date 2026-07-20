# ci-type-check Specification

## Purpose
定义 CI 中独立的 TypeScript 类型检查步骤，确保类型安全在构建流程之外也能被检测。

## Agent Context
- **源码入口：** `.github/workflows/ci.yml`、`tsconfig.json`。
- **关联规范：** `dep-audit-ci`。
- **不变量：** 类型检查必须在所有 PR 中运行；类型错误必须阻断 PR 合入。
- **验证：** `npx tsc --noEmit`。

## Requirements

### Requirement: CI 执行独立 TypeScript 类型检查

CI 流程 SHALL 包含 `npx tsc --noEmit` 独立步骤。该步骤 SHALL 在所有 PR 检查中运行。类型错误 SHALL 导致 CI 失败并阻止 PR 合入。

#### Scenario: 类型检查通过
- **WHEN** PR 代码无 TypeScript 类型错误
- **THEN** CI 类型检查步骤通过

#### Scenario: 类型检查失败阻断合入
- **WHEN** PR 代码存在 TypeScript 类型错误
- **THEN** CI 类型检查步骤失败，PR 无法合入
