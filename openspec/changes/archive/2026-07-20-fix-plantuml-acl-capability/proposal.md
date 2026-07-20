## Why

引入 `@tauri-apps/plugin-http` 后创建的 `plantuml-http-capability` 未加入 `tauri.conf.json` 的显式启用列表，导致所有 PlantUML 渲染请求被 Tauri ACL 拒绝。用户配置的有效 HTTP/HTTPS 服务器地址无法通过 scope 校验，图表渲染完全失效。

## What Changes

- 将 `plantuml-http-capability` 加入 `tauri.conf.json` 的 `app.security.capabilities` 启用列表
- 移除 `main-capability` 中之前临时添加的无 scope `http:default` 权限（`plantuml-http-capability` 已包含该权限及 URL allow scope）
- 调整 `plantuml-http.json` 的 URL scope 格式：`"https://**"` → `"https://*/*"`（URLPattern 标准不支持双星号通配符）
- 移除 `plantuml-http.json` 中冗余的 `"http:default"` 权限（由 `http:allow-fetch` scope 提供命令授权）

## Capabilities

### New Capabilities
_无新能力_

### Modified Capabilities
- `plantuml-render`: 补充运行时 ACL 层的要求——PlantUML HTTP 请求需要通过 Tauri capability 授权，capability 必须显式启用且 scope 必须允许目标 URL。

## Impact

- `src-tauri/tauri.conf.json`：`app.security.capabilities` 列表新增一项
- `src-tauri/capabilities/main.json`：移除临时添加的 `"http:default"`（放在这里语义不正确且没有 scope）
- `src-tauri/capabilities/plantuml-http.json`：修复 scope URL 格式，清理冗余权限
- 无后端 Rust 代码变更，无前端 JS 变更
