## 1. 依赖与配置

- [x] 1.1 安装 `@tauri-apps/plugin-http` npm 依赖
- [x] 1.2 在 `src-tauri/Cargo.toml` 中添加 `tauri-plugin-http` feature
- [x] 1.3 在 `src-tauri/capabilities/` 中添加 HTTP 访问权限声明（允许 PlantUML 服务器域名模式）

## 2. CSP 绕过：改用 Tauri HTTP 插件

- [x] 2.1 在 `src/lib/plantuml-lazy.ts` 中将浏览器原生 `fetch` 替换为 `@tauri-apps/plugin-http` 的 `fetch`
- [x] 2.2 适配 Tauri plugin fetch 的类型差异（Body、Response 类型）
- [x] 2.3 添加 `referrerPolicy: 'no-referrer'` 到请求头

## 3. SVG 清理完善

- [x] 3.1 在 `sanitizePlantUmlSvg` 的元素移除列表中添加 `style` 标签
- [x] 3.2 将 style 属性处理从"全部移除"改为"解析并过滤含 `url()` 的声明，保留其余安全样式"

## 4. 渲染缓存

- [x] 4.1 在 `plantuml-lazy.ts` 模块顶层添加 `svgCache = new Map<string, string>()`，key 为 `serverUrl\0source`
- [x] 4.2 在 `renderPlantUmlSvg` 开头检查缓存，命中则直接返回已清理的 SVG
- [x] 4.3 请求成功并清理后将结果写入缓存

## 5. NodeView 设置切换重建

- [x] 5.1 修改 `handleSettingsChanged`：当 `isPlantUml()` 为 true 且 `isDiagram()` 状态翻转时，dispatch 空事务触发 ProseMirror 调用 `update()`，使 `update()` 中已有的 `wasDiagram !== isDiagram()` 检查返回 `false` 触发重建
- [x] 5.2 确保 `isPlantUml()` 为 true 但 `isDiagram()` 未翻转时正常调用 `render()`

## 6. 空源码短路回退

- [x] 6.1 在 `renderPreview` 或 `renderPlantUml` 调用前检测源码是否仅含空白或 `@startuml/@enduml` 标记，若是则直接显示代码块不发起请求

## 7. 测试更新

- [x] 7.1 更新 `src/lib/plantuml-lazy.test.ts`：mock `@tauri-apps/plugin-http` 的 fetch
- [x] 7.2 添加 `<style>` 元素移除的测试用例
- [x] 7.3 添加含外部 `url()` 的 style 属性部分清理测试用例
- [x] 7.4 添加渲染缓存命中/失效测试用例
- [x] 7.5 添加空源码短路回退测试用例
- [x] 7.6 添加 `referrerPolicy` 验证测试用例

## 8. Code Review 修复

- [x] 8.1 修复 AbortError catch：Tauri fetch 抛出 `Error('Request cancelled')` 而非 `DOMException('AbortError')`，同时检测两种错误类型
- [x] 8.2 修复 `redirect: 'error'` 静默失效：Tauri 插件仅转发 `maxRedirections`，改用 `maxRedirections: 0` 阻止重定向（SSRF 防护）
- [x] 8.3 修复空源码导致 NodeView 不可交互：将空白检查从 `renderPreview` 移到 `render()` 顶部，在进入图表路径前短路
- [x] 8.4 添加 `maxRedirections: 0` 和超时错误消息的测试用例
