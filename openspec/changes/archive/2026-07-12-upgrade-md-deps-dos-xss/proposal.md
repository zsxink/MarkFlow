## Why

`npm audit --omit=dev` 在生产依赖中发现 3 组漏洞，MarkFlow 会直接打开来源未知的 Markdown 文件，这些漏洞与实际使用场景相关：

- **High**：`linkify-it <= 5.0.0` 二次复杂度扫描（GHSA-22p9-wv53-3rq4）
- **Moderate**：`markdown-it <= 14.1.1` smartquotes 二次复杂度 DoS（GHSA-6v5v-wf23-fmfq）
- **Moderate**：间接依赖 `dompurify <= 3.4.10` 多项 XSS / 配置污染问题

依赖链：`@tiptap/starter-kit` → `@tiptap/pm` → `prosemirror-markdown` → `markdown-it` → `linkify-it`；`dompurify` 通过间接路径引入。

## What Changes

- 升级 `markdown-it` 至修复版本（或添加 `overrides` 强制覆盖）
- 确保 `linkify-it` 随 `markdown-it` 一同升级
- 升级 `dompurify` 至 `>=3.4.7`（修复配置污染），或通过 `overrides` 覆盖
- 增加恶意输入回归测试（超长链接、smartquotes 特殊字符、SVG/HTML 清洗）
- CI 中增加 `npm audit --omit=dev` 步骤阻断 high/critical

## Capabilities

### New Capabilities

- `dep-audit-ci`: 生产依赖漏洞审计 CI 步骤，自动阻断 high/critical 漏洞

### Modified Capabilities

<!-- 无已有 spec 需要修改 -->

## Impact

- **依赖**：`markdown-it`、`linkify-it`、`dompurify` 版本升级
- **兼容性**：需验证升级后 Markdown 解析结果无回归
- **CI**：新增或修改 CI pipeline 步骤
- **测试**：新增恶意输入回归测试
