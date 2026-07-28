## Why

Source Mode 当前编辑后保存仍依赖前端 Markdown serializer（`getMarkdown()`），未接入 `markflow-core` 的 `DocumentSession`。M3 的目标是率先让 Source Mode 接入 Core session，使保存内容只来自 Core confirmed snapshot，不再来自前端 serializer。

这是第一次用户路径接入 Core，但不改变默认 WYSIWYG 体验。M3 不一次性完成全部编辑器迁移，而是建立一条可验证、可回退、可继续扩展到 M4-M8 的 Core-backed 文档主路径。

## What Changes

- Source Mode 打开文件时通过 Runtime 创建 Core session，以 session text 初始化 CodeMirror
- Source Mode 用户输入以 UTF-16 patch 发送到 Runtime/Core，不以整篇 Markdown 作为常规同步单位
- Source Mode 保存时只保存 Core confirmed snapshot，保存流程由 Runtime 编排
- Source Mode dirty 状态由 pending patch 与 Core revision 计算，不再由前端 serializer 文本比较决定
- Source Mode 的 outline、stats、large/huge 状态从 Core/Runtime 获取
- WYSIWYG legacy 路径继续可用，并与 Source Mode 新路径隔离
- 外部修改、保存冲突、同路径多窗口后保存冲突继续可触发
- 引入 `markflow-runtime` crate（SessionRegistry、SessionHandle、DocumentRuntimeState）
- 引入 Tauri Bridge commands（open_document / apply_text_patch / save_document 等）
- 引入 Frontend bridge client（coreBridge.ts、coreSession.ts、sourceSyncAdapter.ts）
- pro/m0/m1/m2 的保真 fixture、Unicode 坐标、Large/Huge 预算进入产品路径验证

## Capabilities

### New Capabilities

- `core-backed-source-mode`: Core-backed Source Mode — 接入 Core session 作为文档主路径，保存流程由 Runtime 编排、保存内容只来自 Core confirmed snapshot
- `markflow-runtime`: Rust Runtime layer — SessionRegistry、保存 workflow、FileIdentity 冲突判断、since 调度
- `core-bridge-protocol`: Tauri Bridge DTO 协议 — 统一 ProtocolEnvelope 和 versioned commands
- `source-patch-adapter`: CodeMirror 到 Core patch 适配器 — transaction→patch、batching、ack/resync/flush 状态机

### Modified Capabilities

- `markflow-core-foundation`: Core 已提供的 DocumentSession、TextPatch、save_payload 等能力被 M3 正式接入产品路径。需在现有 spec 中补充对 Tauri Bridge integration 场景的说明。
- `codemirror-source-editor`: Source Mode 编辑路径增加可选 Core-backed 模式，保留 legacy onUpdate 兼容。需补充 Core patch 同步场景和回滚机制说明。
- `document-size-tier`: Large/Huge 策略在 Source Mode Core-backed 路径下的行为验证。需补充 Core session 场景下的 size class 传递行为。
- `atomic-save`: 保存流程增加 Runtime save workflow 编排（Host compare + atomic write），需补充 Core SavePayload 场景的说明。

## Impact

- 新增 `markflow-runtime` crate，在 workspace 中注册
- 新增 `src/lib/coreBridge.ts`、`src/lib/coreSession.ts`、`src/lib/sourceSyncAdapter.ts`
- 修改 `src/lib/editor.source.ts`：增加可选 `onTransaction` 回调
- 修改 `src-tauri/src/lib.rs`：注册新 Tauri commands
- 修改 `src/components/sidebar.fileops.ts`：`saveActiveDocument()` 按 active engine 分派
- 修改 `src/lib/editor.ts`：模式切换增加 Core flush barrier
- 不删除 `getMarkdown()`、`write_file` 等 legacy API，但 Source Mode 保存不得调用它们
- 不替换 ProseMirror WYSIWYG 主体验