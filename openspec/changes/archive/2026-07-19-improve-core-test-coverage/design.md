## Context

MarkFlow 的核心前端路径跨越 DOM、Tauri IPC 和编辑器状态，现有测试未覆盖这些边界。PlantUML 渲染依赖已在 `package.json` 中声明，但当前锁定安装无法解析该模块，使质量门无法完成。

## Goals / Non-Goals

**Goals:**

- 以模块级 Vitest 测试覆盖关键保存、设置、菜单、工具栏、节点视图和 IPC 参数。
- 恢复干净依赖安装后 `npm test` 与 `npm run build` 对 PlantUML 插件的解析。

**Non-Goals:**

- 不改变编辑器、保存或 PlantUML 渲染的产品行为。
- 不向真实 Tauri 后端或远程 PlantUML 服务发起测试请求。

## Decisions

- 使用同目录独立 `*.test.ts` 文件和 `vi.mock` 隔离 Tauri/DOM 边界；这与现有测试框架一致，并保持测试离线、确定性。
- 通过更新既有依赖锁定状态而非改写 HTTP 调用来修复解析错误；应用仍需使用 Tauri HTTP 插件以遵守 CSP 与现有 PlantUML 规范。
- 覆盖公共函数及其用户可见副作用（IPC 参数、状态、菜单项和错误回退），而非测试私有实现细节。

## Risks / Trade-offs

- [模块级 mock 与实际插件 API 漂移] → 保留完整 `npm run build` 作为类型与解析验证，并仅 mock 外部边界。
- [锁文件与已安装目录不一致] → 重新安装锁定依赖后执行完整测试和构建。
