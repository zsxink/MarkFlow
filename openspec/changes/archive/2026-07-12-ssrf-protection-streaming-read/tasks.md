## 1. Client 单例化与超时配置

- [x] 1.1 在 `AppState` 中添加 `reqwest::Client` 字段，启动时构建单例，配置 connect_timeout(5s)、read_timeout(10s)、total timeout(30s)、`redirect::Policy::none()`、连接池 max_idle_per_host(4)
- [x] 1.2 修改 `fetch_remote_image_bytes` 和 `fetch_page_title`，从 `AppState` 获取共享 Client 而非调用 `create_client`
- [x] 1.3 移除或废弃 `http.rs` 中的 `create_client` 函数

## 2. DNS 预解析与 IP 校验

- [x] 2.1 在 `Cargo.toml` 中添加 `trust-dns-resolver` 依赖（如未间接引入）
- [x] 2.2 实现 `resolve_and_validate_host(host: &str) -> Result<Vec<IpAddr>, String>` 函数：解析域名所有 A/AAAA 记录，拒绝 loopback/private/link-local/unspecified/multicast/文档保留地址
- [x] 2.3 实现自定义 DNS resolver，将解析结果注入 reqwest 连接器，避免连接阶段二次解析（DNS rebinding）
- [x] 2.4 修改 `validate_external_url`，移除仅检查 host 字符串的私网 IP 逻辑（改由 DNS 校验层处理）

## 3. 重定向验证增强

- [x] 3.1 修改 `fetch_with_redirects`，每次重定向时对新 URL 执行完整的 DNS 解析 + IP 校验
- [x] 3.2 添加重定向目标的 scheme/port 二次校验（防止协议降级如 HTTPS→HTTP）

## 4. 流式读取

- [x] 4.1 修改 `fetch_remote_image_bytes`，使用 `response.bytes_stream()` 逐块读取，累加字节数超过 20MB 时立即中止
- [x] 4.2 在逐块读取过程中检查前 8 字节 magic bytes，校验 PNG/JPEG/GIF/WebP/BMP 格式
- [x] 4.3 修改 `fetch_page_title`，流式读取最多前 256KB，找到 `</title>` 即停止；最终标题截断到合理长度（如 512 字符）

## 5. 并发控制

- [x] 5.1 在 `AppState` 中添加 `tokio::sync::Semaphore`，默认 permits=3
- [x] 5.2 在 `fetch_remote_image_as_base64` 和 `fetch_page_title` 入口处 acquire semaphore，完成后 release

## 6. 日志脱敏

- [x] 6.1 实现 `redact_url_for_log(url: &str) -> String`，仅保留 scheme + host + path
- [x] 6.2 在所有远程请求的日志输出中使用脱敏后的 URL

## 7. 测试

- [x] 7.1 编写单元测试：超限 chunked 响应的流式中止
- [x] 7.2 编写单元测试：DNS 解析到私网/loopback/保留地址时拒绝
- [x] 7.3 编写单元测试：重定向到私网地址时拒绝
- [x] 7.4 编写单元测试：magic bytes 与 Content-Type 不匹配时拒绝
- [x] 7.5 编写单元测试：URL 脱敏函数
- [x] 7.6 验证正常 HTTP/HTTPS 图片下载和页面标题功能兼容
