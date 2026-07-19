# bundle-budget Specification

## Purpose
定义前端构建产物与字体资源的体积预算及分析基线，防止包体积回涨。

## Agent Context
- **源码入口：** `vite.config.ts`、`scripts/check-bundle-size.sh` 与 `package.json`。
- **关联规范：** `lazy-code-languages`、`lazy-mermaid`、`font-stack`。
- **不变量：** 预算检查必须在超限时失败；分析构建不得改变正常生产构建产物；懒加载依赖不得重新进入主入口包。
- **验证：** `npm run check-size`；`npm run analyze`；`npx openspec validate bundle-budget --strict`。

## Requirements

### Requirement: 捆绑尺寸预算

项目 SHALL 配置 Vite bundle size budget，对主入口 JS 和字体资源设置体积上限。超限时构建 SHALL 失败，防止体积回涨。

#### Scenario: 主入口 JS 预算

- **WHEN** Vite 构建完成
- **THEN** 主入口 JS 文件（含 vendor chunk）gzip 后体积 SHALL NOT 超过 500KB（预算值，可调整）

#### Scenario: 中文字体预算

- **WHEN** 构建完成
- **THEN** 所有中文字体文件（Source Han Serif SC 子集化版本）合计大小 SHALL NOT 超过 4MB

#### Scenario: 超限构建失败

- **WHEN** 任何 bundle 或资源超过预算上限
- **THEN** 构建流程 SHALL 以非零退出码终止，并输出超限文件及实际体积信息

### Requirement: Bundle Visualizer 基线

项目 SHALL 保留 bundle visualizer 基线报告，用于跟踪体积变化趋势。

#### Scenario: 基线报告生成

- **WHEN** 执行 bundle 分析命令
- **THEN** 系统 SHALL 生成交互式 treemap 报告，展示各模块体积占比，保存在项目根目录或 `docs/` 下

#### Scenario: CI 集成

- **WHEN** CI 构建运行
- **THEN** SHALL 在构建产物中包含 bundle size 报告摘要（如 GitHub Actions step summary）
