# vitest-coverage-threshold Specification

## Purpose
定义 vitest 覆盖率阈值配置，确保前端代码质量有最低保障。

## Agent Context
- **源码入口：** `vitest.config.ts`、`package.json`。
- **关联规范：** `regression-coverage`。
- **不变量：** Vitest 配置声明覆盖率阈值；当前 `npm test` 和 CI 未启用覆盖率采集，因此阈值尚未在 PR 中强制执行。
- **验证：** `npm test`；如需测量覆盖率，显式运行 Vitest coverage。

## Requirements

### Requirement: vitest 覆盖率阈值配置

vitest.config.ts SHALL 配置覆盖率阈值：statements 50%、branches 40%、functions 50%、lines 50%。当以覆盖率模式执行时 SHALL 检查覆盖率是否达标；常规 `npm test` 与 CI 当前不启用覆盖率模式。

#### Scenario: 覆盖率达标
- **WHEN** 前端测试执行完成
- **THEN** 所有覆盖率指标达到或超过阈值

#### Scenario: 覆盖率未达标阻断
- **WHEN** 任何覆盖率指标低于阈值
- **THEN** 覆盖率模式下的测试执行失败；常规 CI 不声称执行该检查。
