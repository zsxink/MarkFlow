## 1. Frontend 导出协议

- [x] 1.1 将 PDF 保存对话框移到生成之前，使用活动文档名称作为默认 `.pdf` 文件名，取消时不调用后端
- [x] 1.2 将 `create_pdf` 调用改为传入目标路径并接收写入元数据，补齐 ready/generating/written/validated 日志顺序
- [x] 1.3 为取消、unsupported、timeout、后端失败和成功场景补充前端单元测试
- [x] 1.4 让 PDF 专用 HTML 使用 `exportThemeToCss(theme, { print: true })`

## 2. macOS 原生 PDF 后端

- [x] 2.1 将 macOS target 依赖切换为与 Tauri/wry 锁文件一致的 `objc2`、`objc2-web-kit`、`objc2-foundation`、`objc2-app-kit` 和 `block2`
- [x] 2.2 实现唯一导出作业、受控临时 HTML、字体/图片/双帧 ready 握手与页面超时
- [x] 2.3 使用 `WebviewWindow::with_webview` 与 typed WKWebView API 实现 macOS 11+ `createPDF` 异步生成
- [x] 2.4 实现 macOS 10.15 selector 检测和无面板、异步完成回调的 WebKit save print operation，失败时返回稳定 unsupported 错误
- [x] 2.5 实现同目录临时 PDF、文件头/非空校验、原子提交和所有出口的窗口/临时文件清理
- [x] 2.6 为非 macOS target 保留可编译的稳定 `PDF_UNSUPPORTED` 返回，且不影响 `print_webview`
- [x] 2.7 将超时权威收敛到后端，并把完成 delegate 绑定到原生 operation 生命周期，避免前端提前释放并发锁或回调 context 泄漏

## 3. 后端防回归测试

- [x] 3.1 为 ready 脚本注入、PDF 文件校验、临时路径和原子提交辅助逻辑增加 Rust 单元测试
- [x] 3.2 增加能发现 `create_pdf` 无条件 stub 的平台实现/协议检查
- [x] 3.3 确认失败、超时与迟到回调不会覆盖目标文件或遗留临时资源

## 4. 验证

- [x] 4.1 运行 `npm test` 与 `npx tsc --noEmit`
- [x] 4.2 运行 Rust 单元测试、`cargo check` 和格式检查
- [x] 4.3 在当前 macOS 实机从应用连续导出两次，验证 `%PDF-`、正文、长文末尾内容和临时窗口清理
- [x] 4.4 运行 `openspec validate restore-macos-pdf-export` 并确认所有任务与 delta spec 一致
- [x] 4.5 派独立子 Agent 静态复核改动并重跑关键测试，处理其发现后再交付
