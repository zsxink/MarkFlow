## 1. CI 增强 — 添加类型检查步骤

- [x] 1.1 在 `.github/workflows/ci.yml` 的 "Run tests" 之后添加 "Type check" 步骤：`npx tsc --noEmit`

## 2. CI 增强 — 接入 bundle size 检查

- [x] 2.1 在 `.github/workflows/ci.yml` 的 "Build frontend" 之后添加 "Check bundle size" 步骤：`bash scripts/check-bundle-size.sh`

## 3. Vitest 覆盖率阈值配置

- [x] 3.1 在 `vitest.config.ts` 添加 coverage 配置：provider v8，thresholds statements 50%、branches 40%、functions 50%、lines 50%

## 4. 前端包体积基线

- [x] 4.1 运行 `npm run build && npm run analyze` 获取当前包体积数据
- [x] 4.2 创建 `docs/bundle-baseline.md` 记录当前三个最大 chunk 的大小和内容描述

## 5. 验证

- [x] 5.1 运行 `npm test && npm run build` 确认前端通过
- [x] 5.2 运行 `cargo test` 确认 Rust 通过（94/96 通过，2 个已有失败与本次无关）
- [ ] 5.3 提交所有变更并推送到远程分支
