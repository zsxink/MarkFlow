# ci-openspec-validation Specification

## Purpose
TBD - created by archiving change fix-openspec-validate-deps. Update Purpose after archive.
## Requirements
### Requirement: CI 使用 npm script 执行 OpenSpec 校验

CI 流程 SHALL 通过 `npm run validate:openspec` 执行 OpenSpec 规范校验，而非直接调用 `npx openspec`。`@fission-ai/openspec` SHALL 作为 devDependency 安装，确保 `npm ci` 后 `openspec` 命令可用。

#### Scenario: npm ci 后 openspec 命令可用
- **WHEN** 在全新环境执行 `npm ci`
- **THEN** `openspec` 命令 SHALL 可通过 `npx openspec` 或 npm script 调用

#### Scenario: CI 校验步骤使用 npm script
- **WHEN** GitHub Actions 执行 OpenSpec 校验步骤
- **THEN** SHALL 执行 `npm run validate:openspec` 而非 `npx openspec validate --all`

#### Scenario: 校验失败阻断 CI
- **WHEN** `npm run validate:openspec` 检测到规范错误
- **THEN** CI 流程 SHALL 失败并阻止 PR 合入

