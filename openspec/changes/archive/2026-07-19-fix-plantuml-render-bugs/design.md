## Context

PlantUML 渲染功能在 commit de7e59f 中引入，但存在多个在 mock 测试和 dev 环境下被掩盖的 bug。核心问题是 CSP 拦截所有外部 fetch 请求导致打包后功能不可用，以及设置切换时 NodeView 状态管理不正确。此外缺少渲染缓存、SVG 清理不完整。

相关文件：
- `src/lib/plantuml-lazy.ts`：编码、请求、SVG 清理
- `src/lib/editor.extensions.ts`：NodeView 实现、设置监听、渲染调度
- `src-tauri/tauri.conf.json`：CSP 配置
- `src/lib/plantuml-lazy.test.ts`：现有测试

## Goals / Non-Goals

**Goals:**
- 修复 CSP 拦截问题，使 PlantUML 渲染在生产环境中可用
- 修复设置切换时 NodeView contentDOM 绑定不重建的问题
- 添加渲染结果缓存，避免重复请求
- 完善 SVG 清理，移除 `<style>` 元素并仅剥离危险的 `style` 属性声明
- 增加空源码短路回退
- 添加 `referrerPolicy: 'no-referrer'`

**Non-Goals:**
- 不重构整体架构或引入新的渲染管道
- 不修改 Mermaid 渲染逻辑
- 不处理重定向策略（`redirect: 'error'` 保持现状，后续可优化）
- 不处理在途请求 abort（后续优化）

## Decisions

### 1. 使用 `@tauri-apps/plugin-http` 替代浏览器原生 fetch

**选择**：在 `plantuml-lazy.ts` 中将 `fetch` 替换为 `@tauri-apps/plugin-http` 的 `fetch`。

**替代方案**：
- 修改 CSP 的 `connect-src` 为通配符 → 不安全，违背最小权限原则
- 使用 `asset:` 协议代理 → 需要后端代理服务，增加复杂度

**理由**：`@tauri-apps/plugin-http` 通过 Rust 侧发起请求，完全绕过 webview CSP。权限通过 Tauri capability scope 精确控制（在 `capabilities/` 目录中声明允许的域名），符合 Tauri v2 惯用做法。需新增 npm 依赖 `@tauri-apps/plugin-http`，并在 `Cargo.toml` 中添加对应 feature。

**实现要点**：
- `plantuml-lazy.ts` 中 `import { fetch } from '@tauri-apps/plugin-http'`
- `buildPlantUmlSvgUrl` 保持不变（URL 构建逻辑独立于请求方式）
- `renderPlantUmlSvg` 中的 `fetch` 调用签名基本一致，需适配 Tauri plugin 的类型
- 在 `src-tauri/capabilities/` 中添加 HTTP 访问权限声明

### 2. 设置切换时通过 `return false` 触发 NodeView 重建

**选择**：在 `handleSettingsChanged` 中，当 `isDiagram()` 状态翻转时，不直接调用 `render()`，而是通过 `store.dispatch` 或直接操作 editor view 触发 NodeView 重建。

**替代方案**：
- 在 `render()` 中检测 `isDiagram()` 变化并重建 DOM → 复杂且脆弱
- 销毁旧 NodeView 创建新的 → ProseMirror 不直接支持此操作

**理由**：ProseMirror 的 NodeView `update()` 方法返回 `false` 时会触发重建。但 `handleSettingsChanged` 不在 `update()` 调用链中。最可靠的方式是在设置变更时，通过 `editor.view.dispatch` 触发一个空事务（或修改节点属性），使 ProseMirror 调用 `update()`，在 `update()` 中检测 `isDiagram()` 翻转并返回 `false`。

**实现要点**：
- 修改 `handleSettingsChanged`：当 `isPlantUml()` 且 `isDiagram()` 状态翻转时，dispatch 一个空事务触发 `update()`
- 在 `update()` 中已有的 `wasDiagram !== isDiagram()` 检查会返回 `false`，触发重建
- `handleSettingsChanged` 中若 `isPlantUml()` 为 true 且 `isDiagram()` 未翻转，则正常调用 `render()`

### 3. 在 `plantuml-lazy.ts` 中添加模块级 Map 缓存

**选择**：在模块顶层添加 `const svgCache = new Map<string, string>()`，key 为 `${serverUrl}\0${source}`，value 为清理后的 SVG 字符串。

**替代方案**：
- LRU 缓存（带大小限制）→ 当前场景图表数量有限，Map 足够
- 在 NodeView 侧缓存 → 多个 NodeView 共享同一源码时无法复用

**理由**：模块级 Map 使所有 NodeView 共享缓存，切换文档或多个相同图表时直接命中。key 中用 `\0` 分隔避免 serverUrl 与 source 拼接歧义。清理函数在缓存前执行，缓存中存储已清理的 SVG。

**实现要点**：
- `renderPlantUmlSvg` 开头检查缓存，命中则直接返回
- 请求成功、清理后写入缓存
- `sanitizePlantUmlSvg` 保持独立函数，缓存层在其外层

### 4. SVG 清理策略：移除 `<style>` 元素 + 智能 style 属性清理

**选择**：
1. 在 `sanitizePlantUmlSvg` 的元素移除列表中添加 `style` 标签
2. 对 `style` 属性的处理从"全部移除"改为"解析并过滤含 `url()` 的声明"

**实现要点**：
- 移除 `<style>` 元素：添加到 `querySelectorAll` 列表
- style 属性清理：按 `;` 分割属性值，过滤含 `url(` 的声明，重新拼接剩余声明；若清理后为空则移除整个属性

## Risks / Trade-offs

- **`@tauri-apps/plugin-http` 类型差异**：Tauri plugin 的 fetch 签名与浏览器略有不同（如 `Body` 类型），需适配。→ 低风险，API 面小
- **缓存无大小限制**：极端情况下大量不同图表可能占用内存。→ 低风险，实际使用中图表数量有限，后续可加 LRU
- **`<style>` 移除可能影响某些 PlantUML 主题**：PlantUML 默认使用呈现属性，但自定义主题可能依赖 `<style>`。→ 可接受，安全优先；如需主题支持可后续添加白名单机制
- **空事务触发重建**：dispatch 空事务会触发一次额外的事务处理。→ 性能影响极小，仅在设置切换时发生
