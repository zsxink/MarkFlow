## Why

issue #89 SSRF 防护实现后审查发现 3 个安全缺口：DNS rebinding TOCTOU 竞态、IPv4-mapped IPv6 绕过、缺少 Content-Length 预检和端口验证。

## What Changes

- 自定义 `ValidatingResolver` 替代分离式 DNS 验证，消除 TOCTOU 竞态
- `validate_ip` 添加 IPv4-mapped IPv6 检查（`::ffff:x.x.x.x`）
- `fetch_with_redirects` 添加 Content-Length 预检
- URL 校验添加端口白名单（仅 80/443）
- DNS 解析异步化（`spawn_blocking`）

## Capabilities

### Modified Capabilities

- `safe-http-fetch`: 增加 DNS rebinding 防护、IPv4-mapped 校验、端口验证、Content-Length 预检

## Impact

- `src-tauri/src/http.rs` — 核心安全模块重构
- `src-tauri/src/state.rs` — Client 配置更新
- `src-tauri/src/commands/files.rs` — 调用方适配
- `src-tauri/Cargo.toml` — tokio 添加 macros/rt feature
