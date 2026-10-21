# Proposal

## Why

仓库中存在一批经审计确认无生产调用方的导出壳、类型、常量、依赖配置和一次性产物，继续保留会误导维护者并降低引用分析的准确性。清除这些残留可以减少维护负担和分发体积，同时不改变产品行为。

## What Changes

- 删除 Issue #300 所列的无调用方 TypeScript 函数、类型、常量及兼容别名，并移除对应测试 mock 中的失效 key；保留同文件内仍使用的实现。
- 删除指定 Rust 死代码、失效的 `dead_code` allow 属性及 logger 死语句。
- 移除无直接使用的 `@tauri-apps/plugin-fs`、`highlight.js` 直接依赖及 Tauri fs 插件注册；保留由 `lowlight` 间接需要的 highlight.js。
- 删除被替代的超大字体、根目录一次性脚本；从 Git 索引移除可再生的 bundle report 并加入 `.gitignore`。
- 清理 `vite.config.ts` 中仅对应非直接依赖的手动 chunk 项，保留源码直接导入依赖对应的条目。
- 升级项目本地 OpenSpec CLI，确保 `skip_specs: true` 的纯重构变更可通过仓库的全量规范验证。
- 不涉及 Issue #300 明确排除的存储命令、测试专用 API、关闭状态方法、文件树字段、旧版设置迁移字段及 differential/benchmark 脚本。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无。此变更仅清理实现残留，不改变用户可见行为或现有需求。

## Impact

影响前端 `src/components`、`src/lib`、`src/types`、`vite.config.ts`、`package.json`/锁文件（包括本地 OpenSpec CLI）、Rust `src-tauri` 配置与代码、字体资产、`.gitignore` 及 bundle report 产物。验证覆盖 TypeScript 构建与测试、OpenSpec、Tauri capabilities、Rust clippy/test，以及依赖和构建产物检查。