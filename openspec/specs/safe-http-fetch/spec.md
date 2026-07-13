## Requirements

### Requirement: 流式读取响应体

系统 SHALL 使用逐块流式方式读取 HTTP 响应体，累计已读取字节数，超过预定义上限时立即中止读取并返回错误。

#### Scenario: 图片下载超过 20MB 上限
- **WHEN** 远程图片响应体累计超过 20MB
- **THEN** 系统 SHALL 立即中止读取，返回"文件过大"错误，不继续接收后续数据

#### Scenario: 页面标题响应体超过 256KB
- **WHEN** 远程页面响应体超过 256KB 仍未找到 `</title>` 标签
- **THEN** 系统 SHALL 立即中止读取，返回"标题未找到"错误

#### Scenario: Content-Length 声明小于上限但实际响应超限
- **WHEN** 服务端返回 Content-Length 声明 1MB 但实际响应体超过 20MB（chunked 或不准确）
- **THEN** 系统 SHALL 在运行时累计实际读取字节并在超过上限时中止

### Requirement: DNS 解析后 IP 校验

系统 SHALL 在建立 TCP 连接前手动解析目标域名，验证所有返回的 IP 地址。拒绝 loopback、private、link-local、unspecified、multicast 和文档/保留地址段。

#### Scenario: 公网域名解析到私网 IP（DNS rebinding）
- **WHEN** 域名 `evil.example.com` 解析到 `192.168.1.100`
- **THEN** 系统 SHALL 拒绝连接，返回"目标地址为私网"错误

#### Scenario: 公网域名解析到 loopback
- **WHEN** 域名解析到 `127.0.0.1` 或 `::1`
- **THEN** 系统 SHALL 拒绝连接，返回"目标地址为本地"错误

#### Scenario: 公网域名正常解析到公网 IP
- **WHEN** 域名解析到公网 IP（如 `93.184.216.34`）
- **THEN** 系统 SHALL 允许连接并继续请求

### Requirement: 重定向目标验证

系统 SHALL 在每次 HTTP 重定向时重新执行 URL 验证和 DNS IP 校验，包括 scheme、host、port 以及解析后的 IP 地址。

#### Scenario: 重定向到私网地址
- **WHEN** 请求被 302 重定向到 `http://192.168.1.1/internal`
- **THEN** 系统 SHALL 拒绝跟随重定向，返回"重定向目标为私网"错误

#### Scenario: 重定向到不同公网地址
- **WHEN** 请求从 `https://example.com` 302 重定向到 `https://cdn.example.com/image.png`
- **THEN** 系统 SHALL 对新域名执行 DNS 解析和 IP 校验，通过后跟随重定向

### Requirement: 单例 HTTP Client

系统 SHALL 使用单例 `reqwest::Client`，配置 connect_timeout（5s）、read_timeout（10s）、total timeout（30s）和连接池复用。

#### Scenario: 首次请求复用 Client
- **WHEN** 第一次调用 `fetch_remote_image_bytes` 或 `fetch_page_title`
- **THEN** 系统 SHALL 使用 `AppState` 中的共享 Client 实例，而非每次新建

#### Scenario: 请求超时
- **WHEN** 远程服务器 30 秒内未完成响应
- **THEN** 系统 SHALL 自动中止请求，返回超时错误

### Requirement: 图片 magic bytes 校验

系统 SHALL 在 Content-Type 声明为 `image/*` 时，读取响应体前 8 字节校验 magic bytes，拒绝与声明类型不符的内容。

#### Scenario: Content-Type 为 image/png 但内容不是 PNG
- **WHEN** 服务端返回 `Content-Type: image/png` 但响应体前 8 字节不匹配 PNG magic（`89 50 4E 47`）
- **THEN** 系统 SHALL 拒绝下载，返回"内容类型不匹配"错误

#### Scenario: Content-Type 为 image/jpeg 且内容合法
- **WHEN** 服务端返回 `Content-Type: image/jpeg` 且响应体以 JPEG magic（`FF D8 FF`）开头
- **THEN** 系统 SHALL 允许继续读取并处理图片

### Requirement: 并发请求限制

系统 SHALL 使用信号量（Semaphore）限制最大并发远程请求数，防止批量操作产生请求风暴。

#### Scenario: 批量粘贴多张图片
- **WHEN** 用户同时粘贴 10 张远程图片
- **THEN** 系统 SHALL 最多同时发起 3 个并发请求，其余排队等待

#### Scenario: 并发数不超过上限
- **WHEN** 任意时刻活跃请求数达到上限
- **THEN** 系统 SHALL 阻塞新请求直到有已完成请求释放信号量

### Requirement: 日志脱敏

系统 SHALL 在日志中记录的 URL 只包含 scheme、host 和 path，不记录 query string 和 fragment。

#### Scenario: URL 含 query token
- **WHEN** 请求 URL 为 `https://example.com/img?token=secret123`
- **THEN** 日志中 SHALL 记录 `https://example.com/img`，不包含 token 值

#### Scenario: URL 含 fragment
- **WHEN** 请求 URL 为 `https://example.com/page#section`
- **THEN** 日志中 SHALL 记录 `https://example.com/page`，不包含 fragment
