## MODIFIED Requirements

### Requirement: 捆绑尺寸预算

项目 SHALL 配置 Vite bundle size budget，对主入口 JS 和字体资源设置体积上限。超限时构建 SHALL 失败，防止体积回涨。

#### Scenario: 主入口 JS 预算

- **WHEN** Vite 构建完成
- **THEN** 主入口 JS chunk SHALL 不超过 500KB（gzip 后 150KB）

#### Scenario: Mermaid 不在主 chunk 中

- **WHEN** 构建完成
- **THEN** Mermaid 库 SHALL 不出现在主入口 JS chunk 中（应为独立 lazy load chunk）

#### Scenario: Bundle 分析报告

- **WHEN** 运行 `npm run analyze`
- **THEN** SHALL 输出以下信息：
  - 三个最大 chunk 的名称、大小和内容描述
  - 是否有意外打入的大依赖（>100KB）
  - Mermaid 是否已正确 lazy load
  - 总 bundle 体积和 gzip 后体积
