## Why

生产构建主入口 JS 约 2.27MB（gzip ~719KB），中文字体 Source Han Serif SC 两张合计约 33.6MB。这导致安装包膨胀、冷启动慢、内存占用高。Vite 报告 storage/sidebar 模块同时被静态和动态导入，动态 import 无法形成有效拆包。Mermaid 和 CodeMirror 语言支持在启动时全量加载，进一步加剧体积问题。

## What Changes

- 生成 bundle visualizer 基线报告，明确主包组成
- Mermaid 改为按需加载：仅文档中出现 mermaid fence 时才加载 Mermaid 实现
- CodeMirror 语言支持按文件类型/fence 按需加载，启动时仅注册必要语言
- 消除 storage/sidebar 模块的静态+动态重复引入，建立清晰模块边界
- 中文字体策略调整：优先使用系统字体（PingFang SC / Microsoft YaHei），内置字体按常用字符子集化，稀有字符回退系统字体
- 评估 Bold 字重是否可由 variable font 或单一字重策略替代
- 非首屏界面（如导出功能）改为按需加载
- 增加 bundle size budget 配置，防止体积回涨

## Capabilities

### New Capabilities

- `lazy-mermaid`: Mermaid 图表库按需加载，仅在文档含 mermaid fence 时动态导入
- `lazy-code-languages`: CodeMirror 语言支持按 fence 类型按需加载，启动时仅注册最小语言集
- `bundle-budget`: Vite 构建配置 bundle size budget，超限时 CI 失败

### Modified Capabilities

- `font-stack`: 字体策略变更 — 中文字体优先系统字体，内置字体按子集化策略精简，评估 variable font 替代方案

## Impact

- **前端代码**: `src/components/` 中 Mermaid 相关模块、CodeMirror 语言注册模块需重构为动态 import
- **构建配置**: `vite.config.ts` 需新增 bundle budget 和可能的 manual chunks 配置
- **字体资源**: `src/assets/fonts/` 下中文字体文件需子集化处理，可能删除或替换
- **CI**: 构建流程需增加 bundle size 检查
- **依赖**: 可能引入字体子集化工具（如 `unicode-range` 或 `fonttools`）
- **类型系统**: 无破坏性变更
