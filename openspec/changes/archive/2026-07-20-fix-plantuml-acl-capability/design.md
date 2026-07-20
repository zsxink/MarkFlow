## Context

Tauri v2 的权限系统基于 capability 模型：前端 API 调用（如 `@tauri-apps/plugin-http` 的 `fetch`）需要在 capability 中声明权限和 URL scope 才能通过。

当前 `tauri.conf.json` 显式配置了 `"capabilities": ["main-capability"]`，这意味着 `src-tauri/capabilities/` 目录下的其他 capability 文件（包括 `plantuml-http.json`）不会被纳入应用的活跃权限集。此外，`plantuml-http.json` 的 URL scope 使用了 URLPattern 不支持的 `"https://**"` 双星号语法。

## Goals / Non-Goals

### Goals
- PlantUML 渲染请求通过 Tauri ACL 校验，使用默认 `https://www.plantuml.com/plantuml` 可正常渲染
- 用户配置的自建 HTTP/HTTPS 服务器（含自定义端口）也能通过 ACL 校验
- 清理无 scope 的松散权限声明，保持最小权限原则
- 新增配置自动化验证，防止 capability 遗漏

### Non-Goals
- 不影响 `safe-http-fetch` spec 的后端 HTTP client 逻辑（该 spec 管理 Rust 端的手动 fetch）
- 不改变前端 PlantUML 渲染流程或 UI

## Decisions

### Decision 1: 将 plantuml-http-capability 加入启用列表

**选择**：在 `tauri.conf.json` 的 `app.security.capabilities` 数组中追加 `"plantuml-http-capability"`。

```json
"capabilities": ["main-capability", "plantuml-http-capability"]
```

**理由**：
- Tauri v2 在 `capabilities` 显式列出后，只启用列表内的项
- `main-capability` 与 `plantuml-http-capability` 是叠加关系，非互斥
- 将 HTTP ACL 与核心能力分离，便于独立审查和修改 URL scope

**替代方案**：
- 将 `plantuml-http.json` 的权限合并进 `main.json` → 破坏关注点分离，`main.json` 会混入 HTTP scope 配置
- 移除 `tauri.conf.json` 的 `capabilities` 配置项 → 自动加载目录下所有 capability，但丧失显式控制，容易意外启用未审查的 capability

### Decision 2: 修复 URL scope 格式

**选择**：使用 `"https://*/*"` 替代 `"https://**"`。

**理由**：Tauri 底层使用 `urlpattern` crate 解析 scope URL，遵循 [URLPattern 标准](https://urlpattern.spec.whatwg.org/)。该标准中 `*` 是通配符，而 `**` 没有被定义为特殊语法——会被当作字面主机名 `**` 处理，导致匹配失败。

验证：从 `tauri-plugin-http` 单元测试可知 `"http://*"` 匹配任意 HTTP 主机和路径，`"https://*/*"` 同理。

### Decision 3: 使用 `http:allow-fetch` 替代裸 `http:default`

**选择**：在 `plantuml-http.json` 中移除单独的 `"http:default"` 权限字符串，保留 `http:allow-fetch` 带 scope 的结构化权限。

**理由**：
- `"http:default"` 只启用 fetch 命令但不提供 URL scope，单独存在有误导性——命令已开放但所有 URL 都被拒绝
- `http:allow-fetch` 的 scope 配置同时承担命令授权和 URL 白名单功能，语义完整

## Risks / Trade-offs

- **[scope 过于宽泛]** 当前 `"https://*/*"` 允许所有 HTTPS URL —> 由于 PlantUML 服务器地址是用户配置的，无法预知具体域名，通配是必要的。限制：前端 `plantuml-lazy.ts` 仍校验 URL 合法性（仅 HTTP/HTTPS，无认证信息），且 SVG 清理和安全过滤在渲染后执行
- **[regression 不可见]** capability 配置错误不会导致编译失败或测试失败 —> 新增 capability 的 CI 回归校验步骤

## Open Questions

- 当前 `http:allow-fetch` 的 scope 同时包含 `"https://*/*"` 和 `"http://*/*"`。生产环境中是否应限制为仅 HTTPS？——保留 HTTP 以支持用户自建本地服务（如 `http://localhost:8080`），这是常见部署方式。
