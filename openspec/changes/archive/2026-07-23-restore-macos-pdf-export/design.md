## Context

`exportPdfToFile()` 当前调用 Tauri `create_pdf` 并等待 PDF 字节，但后端命令已在 PR #182 中被替换成无条件报错的 stub。前端测试全部 mock `invoke()`，因此 Rust 实现被删除后仍能通过前端测试。与此同时，当前流程先生成完整 PDF、再弹保存对话框，既浪费资源，也违反已同步的 `pdf-export` 规范。

项目使用 Tauri 2.11.1 / wry 0.55.1，最低支持 macOS 10.15。WKWebView `createPDF` 从 macOS 11 开始可用；旧实现使用 `objc 0.2` 猜测私有字段和错误类型，无法与当前 Tauri 平台句柄编译。

## Goals / Non-Goals

**Goals:**

- 恢复 macOS 不依赖打印机、也不显示打印面板的直接 PDF 文件导出。
- 在生成前选择目标文件；取消时不创建导出 WebView。
- 使用当前 Tauri/wry 对应的 typed Objective-C 绑定，不访问私有字段。
- 显式处理 macOS 10.15 与 11+ 的能力差异。
- 等待字体和图片就绪，并在成功、失败、取消或超时后清理全部临时资源。
- 由后端完成临时写入、PDF 文件头校验和原子提交，前端只在真实成功后提示完成。
- 建立能发现后端 stub 回归的 Rust/平台验证。

**Non-Goals:**

- 本次不实现 Windows WebView2 与 Linux WebKitGTK 的完整原生 PDF 路径。
- 本次不重构 DOCX 或 HTML 导出。
- 不承诺 Word/DOCX 与 WebView 像素级一致。
- 不恢复 PR #181 中已知无法编译的旧 `objc 0.2` 代码。

## Decisions

### 1. 先选择路径，再让后端生成并保存

前端使用 Tauri dialog `save()` 取得目标路径，然后调用：

```text
create_pdf(html_content, output_path) -> PdfExportResult { bytes_written }
```

后端在目标文件同目录写临时文件，校验 `%PDF-` 和非零长度后原子替换最终文件。这样避免通过 JSON IPC 往返整个 PDF 字节数组，也保证用户取消时不生成 PDF。页面、原生生成与文件落定的超时均由后端拥有；前端不得用独立计时器抢先结束 IPC 并释放并发锁，以免仍在运行的旧作业迟到覆盖用户随后选择的文件。

备选方案是保留 `Vec<u8>` 返回并继续调用 `save_binary_export`。该方案会在取消前完成昂贵生成，并把大二进制序列化成 JSON 数组，因此不采用。

### 2. 使用受控临时 HTML 页面和显式 ready 握手

后端将 HTML 写入应用缓存中的随机作业文件，并插入只负责就绪通知的脚本。脚本等待：

- `document.fonts.ready`；
- 所有图片 `decode()` 或加载失败落定；
- 两次 `requestAnimationFrame`。

完成后导航到仅用于握手的自定义 URL。`WebviewWindowBuilder::on_navigation` 捕获该 URL、阻止实际导航并通知 Rust；不再把整段 HTML拼进 `eval`，也不再使用固定 sleep 猜测加载完成。

临时 WebView 使用唯一 label。实机验证确认 WKWebView 会暂停隐藏窗口的 `requestAnimationFrame`，因此使用屏幕外、非任务栏、不获取焦点但保持可渲染的窗口。

### 3. macOS 优先使用分页型 WebKit save print operation

实机验证确认 `createPDF` 会把长文捕获为一张超长 PDF 页面，不能满足现有 A4 与分页规范。因此在 WKWebView 支持 `printOperationWithPrintInfo:` 时，使用 `NSPrintSaveJob` 和 `NSPrintJobSavingURL` 直接写入临时 PDF，并关闭 print/progress panel。打印操作通过 `runOperationModalForWindow:delegate:didRunSelector:contextInfo:` 异步启动；完成 delegate 持有一次性 channel 并在回调中报告成功或失败，避免同步 `runOperation()` 阻塞 Tauri/AppKit 主线程。delegate 作为 Objective-C associated object 绑定到 `NSPrintOperation` 生命周期，不依赖“必须到达”的回调去释放裸 context。该路径不会显示系统打印对话框，也不依赖用户安装 PDF 打印机，同时会应用 `@page` 分页规则。

### 4. `createPDF` 作为 typed 原生后备

通过 `WebviewWindow::with_webview` 和 `PlatformWebview::inner()` 获取 WKWebView 指针，转换为 `objc2_web_kit::WKWebView`。调用前用 `respondsToSelector` 做运行时能力检测，再通过 `objc2-web-kit 0.3.x` 与 `block2 0.6.x` 的 typed API 注册异步完成回调。

当 save print operation 不可用但 `createPDF` 可用时，传入 `None` 配置捕获当前网页 bounds；禁止恢复旧实现中硬编码的 800×1200 rect。原生回调只负责复制 NSData 或返回 NSError；文件写入、校验和提交在 Rust async 流程中完成。

直接依赖仅放在 macOS target，并与锁文件中的 Tauri/wry 版本对齐。移除不再使用的 `objc 0.2`。

### 5. macOS 10.15 使用运行时能力检测

依次检测 `printOperationWithPrintInfo:` 与 `createPDFWithConfiguration:completionHandler:`。若两者均不可用，则返回稳定的 `PDF_UNSUPPORTED`，不得盲目调用 selector。

若 10.15 上 save print operation 不可用，则前端显示系统版本说明；不得崩溃或提示“请重试”。

### 6. 后端拥有超时和清理责任

页面 ready、原生 PDF 回调和文件落定分别设置有界的后端超时；前端等待后端结果，不单独抢先结束 IPC。所有出口都执行：

- 关闭临时 WebView；
- 删除临时 HTML；
- 删除未提交的临时 PDF；
- 释放作业状态。

同一前端继续使用现有并发保护；后端为每个作业使用唯一 label/path，避免迟到回调写入另一个作业。

### 7. PDF 专用 HTML 使用打印主题

`createHtmlExport` 增加 print 选项，PDF 路径调用 `exportThemeToCss(theme, { print: true })`；HTML 导出继续使用屏幕样式。页面包含 `.ProseMirror` 根节点、内联字体和已规范化资源。

### 8. 稳定错误语义和真实防回归测试

后端错误至少区分 `PDF_UNSUPPORTED`、`PDF_LOAD_FAILED`、`PDF_TIMEOUT`、`PDF_GENERATION_FAILED`、`PDF_WRITE_FAILED`、`PDF_INVALID`。前端针对取消、unsupported、timeout 和一般失败显示不同提示并记录原始错误。

除前端 mock 测试外，增加 Rust 可测试的文件校验/临时路径逻辑，并把 macOS `cargo check` 与一次真实 Tauri 导出列为完成门槛。测试或静态检查必须能发现 `create_pdf` 再次变成无条件 stub。

## Risks / Trade-offs

- [WKWebView `createPDF` 不按 A4 分页] → 已通过长文 E2E 证实；现代 macOS 优先使用保存型 print operation，`createPDF` 只作为不具备分页操作时的后备。
- [隐藏 WebView 可能暂停布局或字体加载] → 以 ready 握手和实机验证为门槛；必要时使用屏幕外可渲染窗口。
- [Objective-C delegate 和 block 生命周期错误可能导致崩溃] → 只使用版本匹配的 typed API；打印 delegate 作为 associated object 随 `NSPrintOperation` 释放，不把 Rust Box 暴露成必须由回调回收的裸指针，所有回调只发送一次 channel。
- [macOS 10.15 缺少测试环境] → 保留运行时 selector 检测；无法验证时返回明确 unsupported，禁止盲调 selector。
- [前端超时不能真正取消已提交的原生调用] → 后端超时负责关闭作业资源，迟到回调通过一次性 sender/作业状态被忽略。
- [目标文件覆盖失败可能损坏旧文件] → 始终写同目录临时文件、校验后原子替换；失败时保留原目标。

## Migration Plan

1. 先合入前端“选择路径 → 调后端”的协议和测试。
2. 加入 macOS typed 依赖与条件编译，实现页面 ready、原生生成和原子保存。
3. 运行 TypeScript 测试、类型检查、Rust 测试与 `cargo check`。
4. 在当前 macOS 实机用代表性长文档执行至少两次真实导出并检查 PDF 文件头、页数与末尾内容。
5. 若原生实现发生崩溃或内容缺失，可回滚本 change；独立“打印…”功能保持不变。

## Open Questions

- macOS 10.15 的保存型 print operation 需要在可获得的 10.15 环境完成最终确认；在此之前以运行时安全降级为最低要求。
