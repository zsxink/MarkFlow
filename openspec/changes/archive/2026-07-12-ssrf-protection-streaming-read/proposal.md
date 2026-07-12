## Why

`fetch_remote_image_bytes` 先调用 `response.bytes()` 读取完整响应体再检查 20MB 上限，`fetch_page_title` 使用 `response.text()` 且无响应体上限；URL 校验仅在请求前检查，域名解析到私网 IP（DNS rebinding）或重定向到私网仍可绕过。攻击者可通过巨大响应耗尽内存、慢速响应阻塞线程、或利用 DNS rebinding 实现 SSRF 访问内网。

## What Changes

- 将远程图片读取改为逐块（chunked）流式读取，累计大小超过上限立即中止
- 页面标题抓取增加响应体硬上限（前 256KB），最终标题长度也做截断
- 复用单例 `reqwest::Client`，配置 connect/read/total timeout
- DNS 解析后校验所有目标地址，拒绝 loopback/private/link-local/unspecified/multicast/保留地址
- 重定向每次重新验证目标地址
- 图片除 `Content-Type` 外校验 magic bytes，拒绝伪装内容
- 增加总并发限制，避免批量粘贴图片产生请求风暴
- 日志只记录规范化 URL，不泄露凭据/query secret

## Capabilities

### New Capabilities

- `safe-http-fetch`: 安全的 HTTP 远程内容获取，包含流式读取、DNS 验证、SSRF 防护、并发控制、magic bytes 校验

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **Rust 后端**: `src-tauri/src/http.rs`（Client 构建、重定向验证）、`src-tauri/src/commands/files.rs`（`fetch_remote_image_bytes`、`fetch_page_title`）
- **依赖**: 无新增外部依赖，使用已有 `reqwest`
- **前端**: 无 API 变更，`fetch_remote_image_as_base64` 和 `fetch_page_title` 的 Tauri command 签名不变
