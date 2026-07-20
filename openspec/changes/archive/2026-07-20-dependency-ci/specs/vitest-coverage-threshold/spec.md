# vitest-coverage-threshold Specification

## Purpose
定义 vitest 覆盖率阈值配置，确保前端代码质量有最低保障。

## Agent Context
- **源码入口：** `vitest.config.ts`、`package.json`。
- **关联规范：** `regression-coverage`。
- **不变量：** 覆盖率阈值必须在所有 PR 中检查；低于阈值必须阻断 PR 合入。
- **验证：** `npm test`（含覆盖率检查）。

## Requirements

### Requirement: vitest 覆盖率阈值配置

vitest.config.ts SHALL 配置覆盖率阈值：statements 50%、branches 40%、functions 50%、lines 50%。测试执行时 SHALL 自动检查覆盖率是否达标。

#### Scenario: 覆盖率达标
- **WHEN** 前端测试执行完成
- **THEN** 所有覆盖率指标达到或超过阈值

#### Scenario: 覆盖率未达标阻断
- **WHEN** 任何覆盖率指标低于阈值
- **THEN** 测试执行失败，CI 步骤失败
