# Proposal

## Why

生产依赖审计发现当前锁定的 DOMPurify、markdown-it、Mermaid 及 Mermaid 携带的 KaTeX 命中已知安全公告。MarkFlow 会处理外部 Markdown 和渲染图表，需更新至修复版本并确保 CI 的生产依赖审计通过。

## What Changes

- 将 DOMPurify、markdown-it 和 Mermaid 升级到修复对应公告的兼容版本。
- 将 Mermaid 的 KaTeX 依赖约束到项目已直接使用的修复版 KaTeX，避免保留易受影响的嵌套旧版本。
- 更新 npm 锁文件，并验证生产依赖审计、构建、测试、类型检查及 OpenSpec。
- 不改变产品功能或用户可见行为；不修改安全审计门禁。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无。此变更仅升级实现依赖，不改变现有安全或产品行为要求。

## Impact

影响 `package.json`、`package-lock.json` 及 Mermaid、Markdown、DOMPurify、KaTeX 的解析/渲染依赖树。验证覆盖生产依赖审计、Markdown/Mermaid/KaTeX 相关测试、TypeScript 构建和 OpenSpec 校验。