## ADDED Requirements

### Requirement: 生产依赖漏洞审计 CI 步骤
CI 流程 SHALL 包含 `npm audit --omit=dev --audit-level=high` 步骤。该步骤 SHALL 在所有 PR 检查中运行。当检测到 high 或 critical 级别漏洞时，该步骤 SHALL 失败并阻止 PR 合入。

#### Scenario: PR 含 high/critical 漏洞被阻断
- **WHEN** PR 的生产依赖中存在 high 或 critical 级别漏洞
- **THEN** CI 检查失败，PR 无法合入

#### Scenario: PR 无 high/critical 漏洞通过审计
- **WHEN** PR 的生产依赖中无 high 或 critical 级别漏洞
- **THEN** CI 审计步骤通过

#### Scenario: moderate 级别漏洞不阻断
- **WHEN** PR 的生产依赖中仅存在 moderate 级别漏洞
- **THEN** CI 审计步骤通过（不阻断合入）

### Requirement: 恶意输入不阻塞主线程
系统 SHALL 对超长链接文本、smartquotes 特殊输入等恶意 Markdown 内容保持响应。解析这些输入时，主线程阻塞时间 SHALL 不超过 500ms（在常规硬件上）。

#### Scenario: 超长链接文本解析
- **WHEN** 编辑器打开包含 10000+ 字符超长 URL 的 Markdown 文件
- **THEN** 文件正常打开，编辑器保持响应

#### Scenario: smartquotes DoS 输入
- **WHEN** 编辑器打开包含大量 smartquotes 特殊字符组合的 Markdown 文件
- **THEN** 文件正常打开，编辑器保持响应

### Requirement: 现有功能无回归
依赖升级后，所有现有 Markdown 渲染、Mermaid、链接与图片功能测试 SHALL 全部通过。

#### Scenario: 现有测试套件通过
- **WHEN** 依赖升级完成后执行 `npm test`
- **THEN** 所有测试通过，无新增失败

### Requirement: 生产依赖无已知 high/critical 漏洞
`npm audit --omit=dev` SHALL 不再报告 linkify-it、markdown-it、dompurify 相关的 high 或 critical 级别漏洞。

#### Scenario: 审计干净
- **WHEN** 执行 `npm audit --omit=dev`
- **THEN** 无 linkify-it、markdown-it、dompurify 相关的 high/critical 漏洞报告
