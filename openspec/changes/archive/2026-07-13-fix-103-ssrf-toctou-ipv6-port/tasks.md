## Tasks

- [x] 实现 `ValidatingResolver`（`reqwest::dns::Resolve` + `spawn_blocking`）
- [x] `validate_ip` 添加 IPv4-mapped IPv6 检查
- [x] `fetch_with_redirects` 添加 `max_response_bytes` Content-Length 预检
- [x] 新增 `validate_port()` 端口白名单
- [x] `validate_external_url` 和 `validate_redirect_url` 集成端口验证
- [x] 移除 `fetch_with_redirects` 冗余 `resolve_and_validate_host` 调用
- [x] `validate_redirect_url` 改为 async
- [x] tokio 添加 macros/rt feature
- [x] 新增单元测试（IPv4-mapped、端口验证）
- [x] 全部 53 个 Rust + 150 个 TS 测试通过
