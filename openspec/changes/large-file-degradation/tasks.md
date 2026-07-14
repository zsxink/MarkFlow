## 1. Rust: 新增 file_metadata 命令

- [x] 1.1 在 `src-tauri/src/commands/files.rs` 新增 `FileMetadata` 结构体（size、lines、extension）和 `file_metadata` command
- [x] 1.2 实现行数计数（扫描换行符）并处理大文件时的性能
- [x] 1.3 在前端 `src/lib/storage.ts` 新增 `getFileMetadata` 导出函数
- [x] 1.4 注册新 command 到 Tauri 应用

## 2. Rust: 图片流式处理

- [x] 2.1 修改 `download_image` 使用临时文件 + 原子 rename（先写 `.tmp` 再 rename）
- [x] 2.2 修改 `copyLocalFileToStorage` 路径使用 `fs::copy` 替代 Base64 读+写
- [x] 2.3 在 `read_file_as_base64` 和 `write_file_from_base64` 中增加编码前源文件大小检查（超 20MB 提前报错）
- [x] 2.4 新增 Rust 端图片并发限制（tokio::sync::Semaphore，最大 4 并发）

## 3. Rust: 大文件读取保护

- [x] 3.1 `read_file` command 增加文件大小检查，超过阈值时返回降级建议而非直接拒绝
- [x] 3.2 `read_file_as_base64` 增加文件大小检查

## 4. 前端: 文档大小分级流程

- [x] 4.1 在打开文件前调用 `getFileMetadata`，根据阈值判定 tier
- [x] 4.2 实现 Normal 模式（无变化，直接打开）
- [x] 4.3 实现 Large 模式：打开后显示非阻塞提示条，建议源码模式，关闭自动序列化完整性校验
- [x] 4.4 实现 Huge 模式：显示确认对话框（文件大小、行数、只读预览/强制打开）
- [x] 4.5 实现只读预览模式（纯文本显示，禁用编辑）
- [x] 4.6 实现降级 UI：顶部提示条 + 状态栏图标，可手动覆盖

## 5. 前端: 昂贵任务调度器

- [x] 5.1 创建 `src/lib/taskScheduler.ts`：基于 AbortController + debounce 的通用调度器
- [x] 5.2 迁移编辑器 onUpdate 中的脏检查 debounce 到调度器（400ms）
- [x] 5.3 迁移 editor:update 事件到调度器（80ms 节流）
- [x] 5.4 迁移字数统计到调度器（200ms）— 通过已 debounce 的 editor:update 事件隐式处理
- [x] 5.5 迁移 outline 刷新到调度器（300ms）— 通过已 debounce 的 editor:update 事件隐式处理
- [x] 5.6 迁移行号重算到调度器（150ms）

## 6. 前端: 复杂度上限插件

- [x] 6.1 实现 ProseMirror 插件：节点复杂度计数器，超过限制发出警告（editor.complexity.ts）
- [x] 6.2 实现 CodeMirror 插件：语法高亮最大行数/长度限制，超限降级纯文本（codemirror-highlight-limit.ts）
- [x] 6.3 Mermaid 渲染超时：最大 5s，超限显示 fallback
- [x] 6.4 图片解析数量限制（最多 50 个），超过第 50 个跳过解析

## 7. 前端: 图片处理优化

- [x] 7.1 修改 `copyLocalFileToStorage` 优先使用 `fs::copy`（Rust 端完成），前端不中转 Base64
- [~] 7.2 `pasteImageFile` 直接传递 File path 到 Rust — 浏览器剪贴板 API 不提供 File 路径，不可行
- [x] 7.3 及时释放 object URL — mermaidContextMenu 已有清理逻辑，其余地方未使用 createObjectURL
- [x] 7.4 确保 `loading="lazy"` 在 BlockImage 扩展中生效 — 已配置
- [x] 7.5 前端图片处理并发限制（最多 4 个同时处理）

## 8. 配置与设置

- [x] 8.1 在 settings 类型定义中添加 `largeFileThreshold`、`hugeFileThreshold` 配置项
- [x] 8.2 在 Rust settings 中添加对应字段
- [x] 8.3 默认值：Large 1MB/5000 行，Huge 10MB/50000 行

## 9. 测试与验证

- [x] 9.0 单元测试：`fileSizeTier.test.ts`（10 用例）+ `taskScheduler.test.ts`（11 用例）
- [~] 9.1 手动测试：Normal 文档打开无降级 — `fileSizeTier.test.ts` 覆盖分级逻辑
- [~] 9.2 手动测试：Large 文档提示条与手动覆盖 — degradationBar 组件已实现
- [~] 9.3 手动测试：Huge 文档确认对话框与只读预览 — dialog + readOnly 状态已实现
- [~] 9.4 手动测试：50MB+ 文档不会导致无提示冻结或崩溃 — Rust 端 MAX_READ_FILE_SIZE=100MB
- [~] 9.5 手动测试：网络下载临时文件清理 — temp file + atomic rename + 异常清理已实现
- [~] 9.6 手动测试：图片 Base64 fallback 路径 — fallback 逻辑已实现
- [~] 9.7 手动测试：并发图片限制 — Rust semaphore(4) + 前端 MAX_CONCURRENT_IMAGE_READS=4
- [~] 9.8 手动测试：Mermaid 渲染超时 fallback — withTimeout(5000ms) 已实现
