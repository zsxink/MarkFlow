## 设计方案

### 1. ValidatingResolver（DNS Rebinding TOCTOU 修复）

实现 `reqwest::dns::Resolve` trait，在 reqwest 自身 DNS 解析过程中验证 IP。使用 `tokio::task::spawn_blocking` 包装阻塞的 `to_socket_addrs()` 调用。

### 2. IPv4-mapped IPv6 检查

在 `validate_ip` 的 IPv6 分支顶部添加 `to_ipv4_mapped()` 检查，将 `::ffff:x.x.x.x` 提取为 IPv4 后递归验证。

### 3. Content-Length 预检

`fetch_with_redirects` 新增 `max_response_bytes: Option<u64>` 参数，在开始流式读取前检查 Content-Length。

### 4. 端口白名单

新增 `validate_port()` 函数，`ALLOWED_PORTS = [80, 443]`，在 `validate_external_url` 和 `validate_redirect_url` 中调用。

### 5. 移除冗余 DNS 验证

`fetch_with_redirects` 中移除手动 `resolve_and_validate_host` 调用，完全依赖 `ValidatingResolver`。`validate_redirect_url` 改为 async。
