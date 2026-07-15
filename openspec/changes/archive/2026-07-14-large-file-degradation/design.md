## Context

当前文件读取路径：Rust `fs::read_to_string` → Tauri IPC (String 序列化) → JS string → ProseMirror/CodeMirror 文档 → Markdown 序列化。大文件在这些阶段存在多份完整副本。图片处理类似：`read_file_as_base64` 将整个文件读入内存后 Base64 编码再经 IPC 传输。

文件打开前无 metadata 检查，无法按文件大小选择编辑模式。昂贵任务（序列化、字数统计、outline、行号）无 debounce/取消机制，每次触发都全量计算。

## Goals / Non-Goals

**Goals:**
- 文件打开前读取 metadata（大小、行数），按阈值分级决定编辑模式
- 序列化、字数统计、outline、行号等任务增加 debounce、增量计算和取消机制
- Mermaid、语法高亮、图片解析设置复杂度上限
- 图片优先通过 Rust 流式复制（文件系统路径），避免 Base64 中转
- 网络下载直接流式写入临时文件，校验后原子 rename
- IPC 图片传输在编码前检查源大小，限制并发数和总字节数
- 及时释放 object URL、ArrayBuffer 和中间 Blob 引用

**Non-Goals:**
- 虚拟滚动或分块编辑（超大文件只读预览即可，不需要编辑）
- WebSocket 或 HTTP 流式文件传输
- 自动压缩或优化图片
- Windows 95/大内存机器上的行为变更

## Decisions

### 1. 文件大小分级采用三级制
- **Normal** (< 1MB / < 5000 行)：完整 WYSIWYG 模式，无降级
- **Large** (1MB–10MB / 5000–50000 行)：打开后显示提示条，建议切换到源码模式；仍可 WYSIWYG 但关闭自动序列化完整性校验
- **Huge** (> 10MB / > 50000 行)：读取 metadata 后显示确认对话框，用户选择"只读预览"或"强制打开（可能卡顿）"
- **Rationale**：三级制覆盖了日常编辑、大日志文件和真正超限文档三种场景。阈值可配置。

### 2. Rust 端新增 file_metadata 命令
- 新增 `file_metadata` command 返回 `{ size: u64, lines: u32, extension: String }`
- 前端在调用 `read_file` 前先调 `file_metadata`，根据阈值决定后续流程
- 不增加文件打开延迟（metadata 读取是 O(1)，lseek 级别）
- **Rationale**：避免前端先读文件再检查，浪费带宽和内存

### 3. 昂贵任务调度器使用 AbortController + debounce
- 序列化、字数统计、outline刷新、行号重算各自有独立的调度队列
- 每个任务可被新触发取消（AbortController），只保留最新一次
- debounce 间隔：序列化 400ms、字数统计 200ms、outline 300ms、行号 150ms
- **Rationale**：AbortController 是浏览器原生 API，无额外依赖。分队列避免相互阻塞

### 4. 图片处理限制并发和总量
- 最多 4 个并发图片处理任务
- 单次 IPC 图片传输前检查源文件大小（≤ 20MB）
- 网络下载使用临时文件 + rename 模式
- **Rationale**：控制内存峰值，避免同时处理大量图片

### 5. Rust 流式图片通道优先于 Base64
- 对本地文件图片：直接传递 `convertFileSrc` 路径，浏览器通过 `asset://` protocol 访问
- 对需要存储的图片：Rust 从源路径 `fs::copy`，无需前端中转
- 仅当 `storageMode: 'none'` 时才使用 Base64 data URL
- **Rationale**：`asset://` protocol 是 Tauri 内置能力，零拷贝。仅在用户明确要求 data URL 时 fallback

### 6. 复杂度上限走 ProseMirror/CodeMirror plugin 层
- ProseMirror 插件：在 `content` 解析阶段注入节点复杂度计数器，超过限制停止渲染
- CodeMirror 插件：语法高亮设置最大行数/长度，超限降级为纯文本
- Mermaid：设置最长渲染时间（5s）和最大图元数，超限显示 fallback
- **Rationale**：plugin 层可以优雅降级，不破坏编辑器状态

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 分级阈值不合理导致频繁误判 | 阈值在 settings 中可配置，用户可手动覆盖 |
| AbortController 取消任务导致中间状态不一致 | 取消前等待当前事务完成（graceful 模式） |
| asset:// protocol 在某些 Tauri 平台不支持 | fallback 到 readFileAsBase64 |
| 大文件降级后用户找不到覆盖入口 | 在 status bar 添加显式的模式切换按钮和降级提示条 |
| 复杂度上限导致内容显示不全 | 显示明确提示并提供"完整加载"按钮 |
