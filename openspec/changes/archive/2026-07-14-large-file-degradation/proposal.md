## Why

Markdown 文件读取没有大小限制，大文件内容会在 Rust String、IPC 序列化、JS 字符串、编辑器文档和 Markdown 序列化间存在多份完整副本，造成内存放大和主线程阻塞。图片通过 Base64/IPC 传输同样存在多次完整复制问题。需要分级降级策略来控制资源使用。

## What Changes

- 文件打开前读取 metadata，按大小/行数分级决定编辑模式（正常 WYSIWYG → 建议源码模式 → 超大文件只读/确认）
- 序列化、字数统计、outline、行号等昂贵任务增加 debounce、增量计算和取消机制
- Mermaid、语法高亮、图片解析设置单块和整文档复杂度上限
- 显示明确的降级原因和手动覆盖入口
- 图片优先让 Rust 从已授权路径流式复制，避免浏览器 Base64 中转
- 网络下载直接流式写临时文件，校验完成后原子 rename
- 必须走 IPC 时使用二进制/分块协议，并在编码前检查源大小
- 限制同时处理的图片数量和总字节数
- 及时释放 object URL、ArrayBuffer 和中间 Blob 引用

## Capabilities

### New Capabilities
- `document-size-tier`: 文档大小分级与降级策略，包括打开前的 metadata 检查、分级决策、降级提示和手动覆盖
- `expensive-task-scheduling`: 昂贵任务的 debounce、增量计算、取消机制和复杂度上限
- `image-streaming`: 图片通过 Rust 流式复制替代 Base64 中转，含网络下载流式写入和 IPC 二进制传输

### Modified Capabilities
- 无（当前均为新增能力，不修改现有 spec 的行为要求）

## Impact

- Rust 后端：新增文件 metadata 预读取、流式图片复制、网络下载流式写入、二进制 IPC 传输
- TypeScript 前端：新增文件大小分级逻辑、任务调度器（debounce/取消/增量）、降级 UI（提示条/覆盖入口）
- ProseMirror：复杂度上限插件
- CodeMirror：复杂度上限插件
- 构建：无新增依赖
