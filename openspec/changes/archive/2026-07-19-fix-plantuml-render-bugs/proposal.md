## Why

PlantUML 渲染功能（commit de7e59f）存在多个 bug，导致打包后核心功能不可用（CSP 拦截所有外部请求），以及设置切换时 NodeView 状态错乱。这些问题在 mock 测试和 dev 环境下被掩盖，只有在生产 Tauri webview 中才暴露。此外缺少渲染缓存导致重复请求、SVG 清理不完整存在安全风险。

## What Changes

- **改用 `@tauri-apps/plugin-http` 的 fetch**：绕过 webview CSP，通过 Tauri capability scope 精确授权域名（修复 #1，严重）
- **设置切换导致 `isDiagram()` 翻转时触发 NodeView 重建**：而非仅调用 `render()`（修复 #2，严重）
- **添加渲染结果缓存**：以 `serverUrl + source` 为 key 的 Map 缓存 SVG，避免重复请求（修复 #3）
- **完善 SVG 清理**：移除 `<style>` 元素，仅剥离含外部 `url()` 的 style 属性（修复 #4、#5）
- **增加空源码短路回退**：空白或纯 `@startuml/@enduml` 不发起请求
- **补充 `referrerPolicy: 'no-referrer'`**

## Capabilities

### Modified Capabilities
- `plantuml-render`: CSP 绕过、缓存、SVG 清理、NodeView 重建均为现有 spec 行为的修复与增强

### New Capabilities
无

## Impact

- **代码文件**：`src/lib/plantuml-lazy.ts`、`src/lib/editor.extensions.ts`
- **Tauri 配置**：`src-tauri/tauri.conf.json`（CSP 可能无需修改，改用 plugin-http 后由 capability scope 控制）
- **依赖**：需新增 `@tauri-apps/plugin-http` 依赖
- **测试**：`src/lib/plantuml-lazy.test.ts` 需更新以覆盖新行为
