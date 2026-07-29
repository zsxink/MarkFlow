## Why

M3 完成度复核查验（core-m3-review）识别出 6 项 P2 技术债务，均不阻塞当前功能但长期积累会增加维护成本。此外 review-core-docs-and-specs 变更已完成但未归档。本轮一并清理。

## What Changes

1. 归档滞留的 review-core-docs-and-specs 变更（已执行）
2. scanner.rs（655 行）拆分为合理粒度的子模块
3. 5 个导出命令统一为 save_export + kind enum
4. TypeScript 大文件拆分：exportTheme.ts（624 行）、fileTree.core.ts（770 行）
5. docxExport.ts 类型安全：将 any 替换为具体类型（10 处）
6. Core 相关 spec 合并：source-lifecycle-guard / source-patch-adapter / source-sync-controller 合并为 source-mode-core；runtime-document-service / save-integrity 合并到 markflow-runtime
7. 测试目录重组：检查 __tests__/ 目录结构并统一

## Capabilities

### New Capabilities

- `source-mode-core`: 合并 source-lifecycle-guard / source-patch-adapter / source-sync-controller 三份 spec
- `markflow-runtime`: 合并 runtime-document-service / save-integrity 到已有 markflow-runtime spec

### Modified Capabilities

无。本次变更只做代码清理和 spec 合并，不改变已有产品能力的行为要求。

## Impact

- 影响 Rust Core：scanner.rs 模块结构
- 影响 Tauri 后端：导出命令统一
- 影响前端：exportTheme.ts / fileTree.core.ts 拆分、docxExport.ts 类型安全
- 影响文档：openspec/specs/ 下 spec 合并
- 影响仓库：测试目录调整
