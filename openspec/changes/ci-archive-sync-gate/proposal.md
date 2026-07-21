## Why

issue #150 archive 时曾漏将 delta spec 同步到主规范，导致主规范与实际变更不一致且未被及时发现。需增加 CI gate 来防止此类问题复发，确保归档操作的完整性自动得到检验。

## What Changes

- 新增 `scripts/check-archive-synced.sh`：归档后校验 delta spec 已全部落地到对应主规范（带 cutoff 日期，只拦截 cutoff 之后的归档）
- CI（`.github/workflows/ci.yml`）增加 `npx openspec validate --all` 与 `bash scripts/check-archive-synced.sh` 两步
- `AGENTS.md` 开发流程补充「归档后验证」步骤

## Capabilities

### New Capabilities
- `archive-sync-gate`: 归档变更的同步完整性校验，防止归档操作遗漏 delta spec 同步

### Modified Capabilities
<!-- No existing spec-level behavior changes — 这是一个纯 CI/流程变更，不影响任何已有 spec 的功能要求 -->

## Impact

- 新增 `scripts/check-archive-synced.sh` 脚本，无外部依赖
- CI 新增两步检查，约增加 10-15s 执行时间
- 开发流程新增归档后验证步骤，不影响现有代码
