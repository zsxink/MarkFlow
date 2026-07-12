## Context

MarkFlow 是 Tauri v2 桌面 Markdown 编辑器。Rust 后端有两个远程内容获取函数：

- `fetch_remote_image_bytes`：下载图片转 base64，20MB 上限但先完整读取再检查
- `fetch_page_title`：抓取页面 `<title>`，使用 `response.text()` 无上限

当前 `http.rs` 已实现：
- 手动重定向跟随（最多 5 次），每次重定向调用 `validate_external_url`
- URL scheme/host/IP 校验（拦截 localhost 和直接私网 IP）
- `reqwest::Client` 每次调用都新建，无连接池

已知缺陷：
1. `response.bytes()` / `response.text()` 一次性读入内存，巨大响应可 OOM
2. 域名解析到私网 IP（DNS rebinding）不被检测
3. 无并发控制，批量粘贴可产生请求风暴
4. magic bytes 未校验，`Content-Type: image/*` 可伪造
5. URL query 参数中的凭据可能泄露到日志

## Goals / Non-Goals

**Goals:**
- 流式逐块读取响应体，超限立即中止，内存使用与响应体大小解耦
- DNS 解析后验证实际 IP，阻断 DNS rebinding 和重定向到私网
- 单例 Client 复用连接池，配置完整超时
- 图片 magic bytes 校验，防止伪装内容
- 并发限制防止请求风暴
- 日志脱敏

**Non-Goals:**
- 不实现完整的 HTTP 代理/防火墙功能
- 不改变前端 TypeScript 层 API（`fetchRemoteImageAsBase64`、`fetchPageTitle` 签名不变）
- 不处理 WebSocket 或 SSE 等非 HTTP 协议
- 不引入新的外部依赖

## Decisions

### 1. 流式读取策略：逐块读取 + 累计大小

**决策**: 使用 `response.bytes_stream()`（来自 `futures::StreamExt`）逐块读取，每块累加大小，超过上限立即 drop stream。

**替代方案**:
- 先检查 `Content-Length` 再一次性读取：不可靠，服务端可能不返回或谎报 Content-Length
- 使用 `response.copy_to()` 写入临时文件：增加复杂度，且流式读取已足够控制内存

**理由**: `bytes_stream` 是 reqwest 原生 API，无需额外依赖。逐块读取确保即使 Content-Length 缺失或不准确，也能在运行时拦截超限响应。

### 2. DNS 验证：使用 trust-dns-resolver 解析后校验

**决策**: 在 reqwest 连接前手动解析域名，验证所有返回 IP 是否为安全地址。使用 `trust-dns-resolver`（已间接依赖）做自定义 DNS 解析，然后将解析结果传给连接器。

**替代方案**:
- 仅依赖 `validate_external_url` 检查 host 字符串：无法防御 DNS rebinding
- 使用 reqwest 的自定义 DNS resolver：reqwest 没有公开的 DNS hook，需要底层改造

**理由**: 手动解析后校验是最可靠的 SSRF 防护层。使用 `resolve_to_connectors` 模式：先解析 DNS → 校验 IP → 创建预验证的 TCP 连接。

### 3. Client 单例化

**决策**: 在 `AppState` 中存储 `reqwest::Client`，应用启动时构建一次，配置 connect_timeout(5s)、read_timeout(10s)、total timeout(30s)、连接池 max_idle_per_host(4)。

**替代方案**:
- 每次请求新建 Client（当前方式）：浪费连接池，无超时保障
- 使用 `once_cell::Lazy` 静态单例：无法动态配置超时

**理由**: 复用连接池减少 TCP 握手开销，统一超时配置避免慢速响应阻塞线程。

### 4. Magic bytes 校验

**决策**: 读取前 8 字节做 magic bytes 检验，覆盖常见图片格式（PNG、JPEG、GIF、WebP、BMP、SVG）。仅当 Content-Type 声明为 image/* 时才校验。

**理由**: Content-Type 由服务端控制，可伪造。Magic bytes 来自实际文件内容，无法伪造。

### 5. 并发限制

**决策**: 使用 `tokio::sync::Semaphore` 限制最大并发请求数（默认 3），在 `AppState` 中持有。

**替代方案**:
- 全局速率限制器（rate limiter）：对桌面应用过度设计
- 无限制：可能导致请求风暴

**理由**: Semaphore 是 tokio 原语，零额外依赖，语义清晰。3 并发对桌面应用足够。

### 6. 日志脱敏

**决策**: URL 只记录 host + path，不记录 query 和 fragment。提供 `redact_url_for_log()` 辅助函数。

**理由**: query 参数常含 token、签名等敏感信息，不应进入日志。

## Risks / Trade-offs

- **[性能] 流式读取略增延迟** → 单块读取有微小开销，但对图片/标题场景可忽略
- **[兼容性] DNS 预解析可能与系统 DNS 缓存策略不一致** → 使用 trust-dns 的默认缓存，与系统行为基本一致
- **[复杂度] 自定义 DNS resolver + IP 校验增加代码量** → 但这是 SSRF 防护的核心，复杂度合理
- **[依赖] 引入 trust-dns-resolver** → 它已被 reqwest 间接依赖，不增加新的二进制依赖

## Open Questions

- 是否需要支持 IPv6 地址的 SSRF 检查？当前 `validate_external_url` 已检查 `is_unique_local()`，但 DNS 预解析的 IPv6 检查需要额外覆盖 link-local scope ID 等边界情况
- 并发限制是否需要可配置？当前固定 3，对大多数场景够用
