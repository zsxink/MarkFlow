# url-decoration Specification

## Purpose
定义所见即所得编辑器中裸 URL 的非侵入式识别、交互与复制行为，确保视觉增强不会修改 Markdown 源内容。

## Agent Context
- **源码入口：** `src/lib/urlDecorationPlugin.ts`、`src/lib/editor.ts` 与 `src/components/linkDialog.ts`。
- **关联规范：** `safe-http-fetch`、`keyboard-shortcuts`、`enter-content-integrity`。
- **不变量：** 装饰不得写入或改变 Markdown；已有链接与行内代码必须跳过；打开链接必须要求修饰键并使用安全窗口选项。
- **验证：** `npm test -- src/lib/urlDecorationPlugin.test.ts`；`npx openspec validate url-decoration --strict`。

## Requirements

### Requirement: 裸 URL 装饰

系统 MUST 通过 `src/lib/urlDecorationPlugin.ts` 的 `createUrlDecorationPlugin` 识别文本中的裸 URL，并以 `.auto-link-deco` 内联装饰显示。该装饰 MUST 不创建链接标记，且必须跳过已有链接标记或行内代码中的文本。

#### Scenario: 识别普通文本中的 URL
- **WHEN** 所见即所得文档包含未标记的 `https` URL
- **THEN** 编辑器显示 `.auto-link-deco` 装饰且 Markdown 内容不被改写

#### Scenario: 跳过手动链接和代码
- **WHEN** URL 已位于链接标记或行内代码中
- **THEN** 系统不为该 URL 添加自动装饰

### Requirement: URL 交互与复制

系统 MUST 仅在用户 Ctrl+单击或 Cmd+单击自动装饰的 URL 时以安全窗口选项打开 URL。复制包含手动链接的内容时，系统 MUST 将链接文本序列化为其 `href`。

#### Scenario: 使用修饰键打开自动链接
- **WHEN** 用户 Ctrl+单击或 Cmd+单击自动装饰的 URL
- **THEN** 系统使用 `noopener,noreferrer` 在新窗口中打开该 URL

#### Scenario: 普通单击不打开链接
- **WHEN** 用户未按修饰键单击自动装饰的 URL
- **THEN** 系统保留编辑器的普通光标定位行为
